using System;
using System.Data.OleDb;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

[DataContract]
public class Input {
    [DataMember] public string operation;
    [DataMember] public string path;
    [DataMember] public string provider;
    [DataMember] public string identity;
    [DataMember] public string schema;
    [DataMember] public int revision;
    [DataMember] public string data;
}
[DataContract]
public class Output {
    [DataMember] public bool ok;
    [DataMember] public string code;
    [DataMember] public string message;
    [DataMember] public string identity;
    [DataMember] public string schema;
    [DataMember] public int revision;
    [DataMember] public string data;
    [DataMember] public string path;
}
public class FileDatabase {
    const string Schema = "middleby-file-v1";
    static string Connection(Input request) {
        var builder = new OleDbConnectionStringBuilder();
        builder.Provider = request.provider;
        builder.DataSource = Path.GetFullPath(request.path);
        builder["Mode"] = "Share Deny None";
        if (request.provider == "Microsoft.Jet.OLEDB.4.0") builder["Jet OLEDB:Engine Type"] = 5;
        return builder.ConnectionString;
    }
    static void Add(OleDbCommand cmd, OleDbType type, object value) {
        var p = cmd.Parameters.Add("p" + cmd.Parameters.Count, type);
        p.Value = value;
        if (value is string) p.Size = ((string)value).Length;
    }
    static Output Read(OleDbConnection db) {
        using (var cmd = db.CreateCommand()) {
            cmd.CommandText = "SELECT [BaseIdentity],[SchemaId],[Revision],[Payload] FROM [MiniERPState] WHERE [Id]=1";
            using (var reader = cmd.ExecuteReader()) {
                if (!reader.Read()) return new Output { code = "INVALID", message = "O arquivo nao contem uma base Mini ERP." };
                var result = new Output { ok = true, identity = Convert.ToString(reader[0]), schema = Convert.ToString(reader[1]), revision = Convert.ToInt32(reader[2]), data = Convert.ToString(reader[3]) };
                if (result.schema != Schema) return new Output { code = "SCHEMA", message = "A estrutura da base nao e compativel com esta versao do programa." };
                return result;
            }
        }
    }
    static Output Create(Input request) {
        if (File.Exists(request.path)) return new Output { code = "EXISTS", message = "O arquivo ja existe. Selecione a base existente ou outro nome." };
        string claimPath = request.path + ".creating";
        var claim = new FileStream(claimPath, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None);
        try {
            object catalog = null, active = null;
            try {
                catalog = Activator.CreateInstance(Type.GetTypeFromProgID("ADOX.Catalog", true));
                catalog.GetType().InvokeMember("Create", BindingFlags.InvokeMethod, null, catalog, new object[] { Connection(request) });
                active = catalog.GetType().InvokeMember("ActiveConnection", BindingFlags.GetProperty, null, catalog, null);
                active.GetType().InvokeMember("Close", BindingFlags.InvokeMethod, null, active, null);
            } finally {
                if (active != null && Marshal.IsComObject(active)) Marshal.FinalReleaseComObject(active);
                if (catalog != null && Marshal.IsComObject(catalog)) Marshal.FinalReleaseComObject(catalog);
            }
            using (var db = new OleDbConnection(Connection(request))) {
                db.Open();
                using (var cmd = db.CreateCommand()) {
                    cmd.CommandText = "CREATE TABLE [MiniERPState] ([Id] LONG NOT NULL PRIMARY KEY, [BaseIdentity] TEXT(36) NOT NULL, [SchemaId] TEXT(64) NOT NULL, [Revision] LONG NOT NULL, [Payload] MEMO, [UpdatedAt] DATETIME NOT NULL)";
                    cmd.ExecuteNonQuery();
                    cmd.CommandText = "INSERT INTO [MiniERPState] ([Id],[BaseIdentity],[SchemaId],[Revision],[Payload],[UpdatedAt]) VALUES (1,?,?,1,?,?)";
                    Add(cmd, OleDbType.VarWChar, request.identity);
                    Add(cmd, OleDbType.VarWChar, Schema);
                    Add(cmd, OleDbType.LongVarWChar, request.data);
                    Add(cmd, OleDbType.Date, DateTime.UtcNow);
                    cmd.ExecuteNonQuery();
                }
                return Read(db);
            }
        } finally { claim.Dispose(); try { File.Delete(claimPath); } catch { } }
    }
    static Output Execute(Input request) {
        if (request.provider != "Microsoft.Jet.OLEDB.4.0" && request.provider != "Microsoft.ACE.OLEDB.12.0" && request.provider != "Microsoft.ACE.OLEDB.16.0") throw new ArgumentException("Componente de armazenamento invalido.");
        if (request.operation == "create") return Create(request);
        if (!File.Exists(request.path)) return new Output { code = "UNAVAILABLE", message = "A base nao foi encontrada. Confira o caminho e o acesso a pasta." };
        using (var db = new OleDbConnection(Connection(request))) {
            db.Open();
            if (request.operation == "read") return Read(db);
            if (request.operation != "write") throw new ArgumentException("Operacao de armazenamento invalida.");
            using (var tx = db.BeginTransaction()) {
                try {
                    using (var cmd = db.CreateCommand()) {
                        cmd.Transaction = tx;
                        cmd.CommandText = "UPDATE [MiniERPState] SET [Payload]=?,[Revision]=[Revision]+1,[UpdatedAt]=? WHERE [Id]=1 AND [BaseIdentity]=? AND [SchemaId]=? AND [Revision]=?";
                        Add(cmd, OleDbType.LongVarWChar, request.data);
                        Add(cmd, OleDbType.Date, DateTime.UtcNow);
                        Add(cmd, OleDbType.VarWChar, request.identity);
                        Add(cmd, OleDbType.VarWChar, Schema);
                        Add(cmd, OleDbType.Integer, request.revision);
                        if (cmd.ExecuteNonQuery() != 1) {
                            tx.Rollback();
                            var current = Read(db);
                            return new Output { code = current.ok && current.identity == request.identity ? "CONFLICT" : "BASE_CHANGED", message = "A base foi alterada. Atualize os dados antes de continuar." };
                        }
                    }
                } catch (OleDbException error) {
                    tx.Rollback();
                    foreach (OleDbError detail in error.Errors) {
                        if (detail.NativeError == 3188 || detail.NativeError == 3260 || detail.NativeError == 3218 || detail.NativeError == 3197) return new Output { code = "CONFLICT", message = "Outra gravacao esta em andamento. Atualize e tente novamente." };
                    }
                    throw;
                } catch { tx.Rollback(); throw; }
                try { tx.Commit(); }
                catch { return new Output { code = "COMMIT_UNKNOWN", message = "Nao foi possivel confirmar o resultado da gravacao. Reabra a base e confira o registro antes de repetir." }; }
                return new Output { ok = true, identity = request.identity, schema = Schema, revision = request.revision + 1 };
            }
        }
    }
    [STAThread]
    public static int Main() {
        Console.OutputEncoding = new UTF8Encoding(false);
        Output result;
        try {
            var input = (Input)new DataContractJsonSerializer(typeof(Input)).ReadObject(Console.OpenStandardInput());
            if (input.data != null && input.data.Length > 16 * 1024 * 1024) throw new ArgumentException("A base ultrapassa o limite desta versao de armazenamento.");
            result = Execute(input);
        } catch (Exception error) {
            var root = error.GetBaseException();
            string code = root is COMException && ((COMException)root).ErrorCode == unchecked((int)0x80040154) ? "PROVIDER" : "UNAVAILABLE";
            if (root is InvalidOperationException && root.Message.IndexOf("registr", StringComparison.OrdinalIgnoreCase) >= 0) code = "PROVIDER";
            result = new Output { code = code, message = code == "PROVIDER" ? "Componente de banco em arquivo indisponivel nesta arquitetura." : "Nao foi possivel acessar a base. Confira o arquivo, as permissoes e a disponibilidade da pasta." };
        }
        new DataContractJsonSerializer(typeof(Output)).WriteObject(Console.OpenStandardOutput(), result);
        return result.ok ? 0 : 1;
    }
}
