using System;
using System.Data;
using System.Data.OleDb;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;

// Diagnostico independente. Nao implementa o armazenamento da aplicacao.
// Toda operacao exige a identidade da base descartavel criada nesta execucao.
[DataContract]
public class ProbeResult {
    [DataMember(Name = "status")] public string Status;
    [DataMember(Name = "provider")] public string Provider;
    [DataMember(Name = "bitness")] public int Bitness;
    [DataMember(Name = "version")] public int Version;
    [DataMember(Name = "amount")] public string Amount;
    [DataMember(Name = "historyCount")] public int HistoryCount;
    [DataMember(Name = "message")] public string Message;
    [DataMember(Name = "rollbackVerified")] public bool RollbackVerified;
    [DataMember(Name = "foreignKeyVerified")] public bool ForeignKeyVerified;
    [DataMember(Name = "unicodeVerified")] public bool UnicodeVerified;
}

public class Probe {
    const string InitialNote = "João d'Ávila — saúde e medição";
    static string operation, database, provider, runId;
    static int recordId = 1;
    static string stage = "argumentos";

    static string Argument(string[] args, string name, bool required) {
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
        if (required) throw new ArgumentException("Parametro obrigatorio: " + name);
        return null;
    }

    static string ConnectionString() {
        var builder = new OleDbConnectionStringBuilder();
        builder.Provider = provider;
        builder.DataSource = database;
        builder["Mode"] = "Share Deny None";
        if (provider == "Microsoft.Jet.OLEDB.4.0") builder["Jet OLEDB:Engine Type"] = 5;
        return builder.ConnectionString;
    }

    static OleDbCommand Command(OleDbConnection db, OleDbTransaction tx, string sql) {
        var cmd = db.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = 10;
        if (tx != null) cmd.Transaction = tx;
        return cmd;
    }

    static void Execute(OleDbConnection db, OleDbTransaction tx, string sql) {
        stage = "SQL: " + sql;
        using (var cmd = Command(db, tx, sql)) cmd.ExecuteNonQuery();
    }

    static void Add(OleDbCommand cmd, OleDbType type, object value) {
        var parameter = cmd.Parameters.Add("p" + cmd.Parameters.Count, type);
        parameter.Value = value;
        if (value is string) parameter.Size = ((string)value).Length;
    }

    static void Create() {
        if (File.Exists(database)) throw new IOException("O diagnostico nao substitui arquivos existentes.");
        object catalog = null, connection = null;
        try {
            stage = "criar arquivo";
            catalog = Activator.CreateInstance(Type.GetTypeFromProgID("ADOX.Catalog", true));
            catalog.GetType().InvokeMember("Create", BindingFlags.InvokeMethod, null, catalog, new object[] { ConnectionString() });
            connection = catalog.GetType().InvokeMember("ActiveConnection", BindingFlags.GetProperty, null, catalog, null);
            connection.GetType().InvokeMember("Close", BindingFlags.InvokeMethod, null, connection, null);
        } finally {
            if (connection != null && Marshal.IsComObject(connection)) Marshal.FinalReleaseComObject(connection);
            if (catalog != null && Marshal.IsComObject(catalog)) Marshal.FinalReleaseComObject(catalog);
        }
        using (var db = new OleDbConnection(ConnectionString())) {
            db.Open();
            Execute(db, null, "CREATE TABLE [ProbeMeta] ([RunId] TEXT(36) NOT NULL PRIMARY KEY)");
            Execute(db, null, "CREATE TABLE [ProbeRecords] ([Id] LONG NOT NULL PRIMARY KEY, [Revision] LONG NOT NULL, [Amount] CURRENCY NOT NULL, [Note] MEMO)");
            Execute(db, null, "CREATE TABLE [ProbeHistory] ([Id] COUNTER PRIMARY KEY, [RecordId] LONG NOT NULL, [PreviousRevision] LONG NOT NULL, [PreviousAmount] CURRENCY NOT NULL, CONSTRAINT [ProbeHistory_Record] FOREIGN KEY ([RecordId]) REFERENCES [ProbeRecords] ([Id]))");
            using (var cmd = Command(db, null, "INSERT INTO [ProbeMeta] ([RunId]) VALUES (?)")) {
                stage = "gravar identidade";
                Add(cmd, OleDbType.VarWChar, runId); cmd.ExecuteNonQuery();
            }
            for (int id = 1; id <= 3; id++) using (var cmd = Command(db, null, "INSERT INTO [ProbeRecords] ([Id],[Revision],[Amount],[Note]) VALUES (?,1,?,?)")) {
                stage = "gravar moeda e texto";
                Add(cmd, OleDbType.Integer, id); Add(cmd, OleDbType.Currency, 0.30m); Add(cmd, OleDbType.LongVarWChar, InitialNote); cmd.ExecuteNonQuery();
            }
        }
    }

    static void Identity(OleDbConnection db) {
        using (var cmd = Command(db, null, "SELECT [RunId] FROM [ProbeMeta]")) {
            if (!String.Equals(Convert.ToString(cmd.ExecuteScalar()), runId, StringComparison.Ordinal))
                throw new InvalidOperationException("O arquivo nao e a base descartavel desta execucao.");
        }
    }

    static ProbeResult Read(OleDbConnection db, OleDbTransaction tx) {
        var result = new ProbeResult { Status = "verified", Provider = provider, Bitness = IntPtr.Size * 8 };
        using (var cmd = Command(db, tx, "SELECT [Revision],[Amount],[Note] FROM [ProbeRecords] WHERE [Id]=?")) {
          Add(cmd, OleDbType.Integer, recordId);
          using (var reader = cmd.ExecuteReader()) {
            if (!reader.Read()) throw new InvalidOperationException("Registro de diagnostico ausente.");
            result.Version = Convert.ToInt32(reader[0]);
            result.Amount = Convert.ToDecimal(reader[1]).ToString("F2", CultureInfo.InvariantCulture);
            result.Message = Convert.ToString(reader[2]);
          }
        }
        using (var cmd = Command(db, tx, "SELECT COUNT(*) FROM [ProbeHistory]")) result.HistoryCount = Convert.ToInt32(cmd.ExecuteScalar());
        return result;
    }

    static bool IsContention(OleDbException error) {
        foreach (OleDbError item in error.Errors) {
            if (item.SQLState == "40001" || item.NativeError == 3188 || item.NativeError == 3197 || item.NativeError == 3218 || item.NativeError == 3260) return true;
        }
        return false;
    }

    static ProbeResult Write(OleDbConnection db, string[] args) {
        string gate = Argument(args, "--gate", true), ready = Argument(args, "--ready", true);
        int expectedVersion = Int32.Parse(Argument(args, "--version", true), CultureInfo.InvariantCulture);
        decimal amount = Decimal.Parse(Argument(args, "--amount", true), CultureInfo.InvariantCulture);
        File.WriteAllText(ready, "ready", new UTF8Encoding(false));
        var deadline = DateTime.UtcNow.AddSeconds(20);
        while (!File.Exists(gate)) {
            if (DateTime.UtcNow > deadline) throw new TimeoutException("O outro processo nao liberou o inicio do teste.");
            Thread.Sleep(25);
        }
        for (int attempt = 0; ; attempt++) {
            using (var tx = db.BeginTransaction()) {
                try {
                    int affected;
                    using (var cmd = Command(db, tx, "UPDATE [ProbeRecords] SET [Revision]=[Revision]+1, [Amount]=?, [Note]=? WHERE [Id]=? AND [Revision]=?")) {
                        Add(cmd, OleDbType.Currency, amount);
                        Add(cmd, OleDbType.LongVarWChar, InitialNote);
                        Add(cmd, OleDbType.Integer, recordId);
                        Add(cmd, OleDbType.Integer, expectedVersion);
                        affected = cmd.ExecuteNonQuery();
                    }
                    if (affected == 0) {
                        tx.Rollback();
                        return new ProbeResult { Status = "conflict", Provider = provider, Bitness = IntPtr.Size * 8 };
                    }
                    if (affected != 1) throw new InvalidOperationException("Atualizacao inesperada no diagnostico.");
                    using (var cmd = Command(db, tx, "INSERT INTO [ProbeHistory] ([RecordId],[PreviousRevision],[PreviousAmount]) VALUES (?,?,?)")) {
                        Add(cmd, OleDbType.Integer, recordId); Add(cmd, OleDbType.Integer, expectedVersion); Add(cmd, OleDbType.Currency, 0.30m); cmd.ExecuteNonQuery();
                    }
                    tx.Commit();
                    return new ProbeResult { Status = "saved", Provider = provider, Bitness = IntPtr.Size * 8 };
                } catch (OleDbException error) {
                    tx.Rollback();
                    if (!IsContention(error) || attempt >= 8) throw;
                }
            }
            Thread.Sleep(50 * (attempt + 1));
        }
    }

    static ProbeResult Verify(OleDbConnection db) {
        var before = Read(db, null);
        bool duplicateRejected = false;
        using (var tx = db.BeginTransaction()) {
            try {
                Execute(db, tx, "UPDATE [ProbeRecords] SET [Amount]=999.99 WHERE [Id]=1");
                Execute(db, tx, "INSERT INTO [ProbeRecords] ([Id],[Revision],[Amount]) VALUES (1,1,1.00)");
            } catch (OleDbException) { duplicateRejected = true; }
            finally { tx.Rollback(); }
        }
        bool foreignKeyRejected = false;
        using (var tx = db.BeginTransaction()) {
            try { Execute(db, tx, "INSERT INTO [ProbeHistory] ([RecordId],[PreviousRevision],[PreviousAmount]) VALUES (999,1,1.00)"); }
            catch (OleDbException) { foreignKeyRejected = true; }
            finally { tx.Rollback(); }
        }
        var after = Read(db, null);
        after.RollbackVerified = duplicateRejected && before.Amount == after.Amount && before.Version == after.Version && before.HistoryCount == after.HistoryCount;
        after.ForeignKeyVerified = foreignKeyRejected;
        after.UnicodeVerified = after.Message == InitialNote;
        if (!after.RollbackVerified || !after.ForeignKeyVerified || !after.UnicodeVerified) throw new InvalidOperationException("Uma verificacao de integridade nao foi aprovada.");
        return after;
    }

    static void Print(ProbeResult result) {
        using (var stream = new MemoryStream()) {
            new DataContractJsonSerializer(typeof(ProbeResult)).WriteObject(stream, result);
            Console.WriteLine(Encoding.UTF8.GetString(stream.ToArray()));
        }
    }

    public static int Main(string[] args) {
        Console.OutputEncoding = new UTF8Encoding(false);
        try {
            operation = Argument(args, "--operation", true);
            if (operation != "create" && operation != "write" && operation != "verify" && operation != "read") throw new ArgumentException("Operacao de diagnostico invalida.");
            database = Path.GetFullPath(Argument(args, "--database", true));
            provider = Argument(args, "--provider", true);
            runId = Argument(args, "--run-id", true);
            string row = Argument(args, "--record-id", false);
            recordId = row == null ? 1 : Int32.Parse(row, CultureInfo.InvariantCulture);
            if (recordId < 1 || recordId > 3 || operation == "verify" && recordId != 1) throw new ArgumentException("Registro de diagnostico invalido.");
            if (provider != "Microsoft.ACE.OLEDB.16.0" && provider != "Microsoft.ACE.OLEDB.12.0" && provider != "Microsoft.Jet.OLEDB.4.0") throw new ArgumentException("Provider de diagnostico invalido.");
            if (operation == "create") Create();
            using (var db = new OleDbConnection(ConnectionString())) {
                db.Open(); Identity(db);
                var result = operation == "write" ? Write(db, args) : operation == "verify" ? Verify(db) : Read(db, null);
                if (operation == "create") result.Status = "available";
                Print(result);
            }
            return 0;
        } catch (Exception error) {
            Print(new ProbeResult { Status = "error", Provider = provider, Bitness = IntPtr.Size * 8, Message = stage + ": " + error.GetBaseException().Message });
            return 1;
        }
    }
}
