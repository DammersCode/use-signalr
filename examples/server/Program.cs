using Server;
using Server.Hubs;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://localhost:5299");

builder.Services.AddSignalR();
builder.Services.AddSingleton<Broadcaster>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<Broadcaster>());

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5301",
                "http://localhost:5302",
                "http://localhost:5303",
                "http://localhost:5304",
                "http://localhost:5305",
                "http://localhost:5306",
                "http://localhost:5307")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

app.UseCors();

app.MapGet("/", () => "use-signalr example server");
app.MapHub<ChatHub>("/hubs/chat");
app.MapHub<CounterHub>("/hubs/counter");

app.Run();
