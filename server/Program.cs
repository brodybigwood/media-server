var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://*:5000");

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

app.Run();
