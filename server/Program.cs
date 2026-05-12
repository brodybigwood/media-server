using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://*:5000");
builder.Services.AddScoped(_ => new SqliteConnection("Data Source=../media.db"));

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        var secretKey = Environment.GetEnvironmentVariable("MEDIA_API_KEY");

        if (!context.Request.Headers.TryGetValue("X-API-KEY", out var extractedKey) || extractedKey != secretKey)
        {
            Console.WriteLine($"API Key expected: {secretKey}");
            Console.WriteLine($"API Key received: {extractedKey}");
            context.Response.StatusCode = 401;
            await context.Response.WriteAsync("failed to authenticate (api key missing or incorrect)");
            return; // failed to authenticate, so deny access to media
        }
    }
    
    await next(); // continue
});

app.MapGet("/api", () => "Succesfully authenticated!");

var provider = new FileExtensionContentTypeProvider();
app.MapGet("/api/media/{id}/file", async (int id, Microsoft.Data.Sqlite.SqliteConnection db) =>
{
    await db.OpenAsync();
    using var command = db.CreateCommand();
    command.CommandText = "SELECT filepath FROM media WHERE id = @id";
    command.Parameters.AddWithValue("@id", id);

    var path = await command.ExecuteScalarAsync() as string;
    path = Path.GetFullPath(Path.Combine("..", path ?? ""));

    if (string.IsNullOrEmpty(path) || !System.IO.File.Exists(path))
    {
        return Results.NotFound();
    }

    if (!provider.TryGetContentType(path, out var contentType))
    {
        contentType = "application/octet-stream";
    }

    return Results.File(path, contentType);
});

app.MapGet("/api/media/{id}/thumbnail", (int id) =>
{
    var filePath = Path.Combine(Directory.GetCurrentDirectory(), "thumbnail/512", id + ".jpg");

    if (!File.Exists(filePath))
        return Results.NotFound();

    return Results.File(filePath, "image/jpeg");
});

app.MapGet("/api/media/{id}/data", async (int id, SqliteConnection db) =>
{
    await db.OpenAsync();
    using var cmd = new SqliteCommand("SELECT * FROM media WHERE id = @id", db);
    cmd.Parameters.AddWithValue("@id", id);
    using var reader = await cmd.ExecuteReaderAsync();

    if (await reader.ReadAsync())
    {
        // Dynamically map columns to a dictionary for clean JSON output, handling NULLs
        var data = Enumerable.Range(0, reader.FieldCount)
                             .ToDictionary(
                                 reader.GetName, 
                                 i => reader.IsDBNull(i) ? null : reader.GetValue(i)
                             );
        return Results.Ok(data);
    }
    return Results.NotFound();
});

app.MapGet("/api/media/index/all", async (SqliteConnection db) =>
{
    await db.OpenAsync();
    using var cmd = new SqliteCommand("SELECT id, timestamp FROM media ORDER BY timestamp DESC", db);

    using var reader = await cmd.ExecuteReaderAsync();
    var results = new List<object>();

    while (await reader.ReadAsync())
    {
        results.Add(new { 
            id = reader.GetInt32(0), 
            timestamp = reader.IsDBNull(1) ? 0 : reader.GetInt64(1) 
        });
    }

    return Results.Ok(results);
});

app.MapGet("/api/media/index/range/{start}/{end}", async (int start, int end, SqliteConnection db) =>
{
    await db.OpenAsync();
    using var cmd = new SqliteCommand("SELECT id, timestamp FROM media WHERE timestamp BETWEEN @start AND @end ORDER BY timestamp DESC", db);
    cmd.Parameters.AddWithValue("@start", start);
    cmd.Parameters.AddWithValue("@end", end);

    using var reader = await cmd.ExecuteReaderAsync();
    var results = new List<object>();

    while (await reader.ReadAsync())
    {
        results.Add(new { 
            id = reader.GetInt32(0), 
            timestamp = reader.IsDBNull(1) ? 0 : reader.GetInt64(1) 
        });
    }

    return Results.Ok(results);
});

app.MapPost("/api/media/{id}/metadata", async (int id, MetadataUpdate update, SqliteConnection db) =>
{
    await db.OpenAsync();
    using var cmd = new SqliteCommand("UPDATE media SET description = @desc, tags = @tags WHERE id = @id", db);
    cmd.Parameters.AddWithValue("@desc", (object?)update.Description ?? DBNull.Value);
    cmd.Parameters.AddWithValue("@tags", (object?)update.Tags ?? DBNull.Value);
    cmd.Parameters.AddWithValue("@id", id);

    var rows = await cmd.ExecuteNonQueryAsync();
    return rows > 0 ? Results.Ok() : Results.NotFound();
});

app.Run();

public record MetadataUpdate(string? Description, string? Tags);
