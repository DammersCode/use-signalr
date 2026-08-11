using Microsoft.AspNetCore.SignalR;

namespace Server.Hubs;

/// <summary>Debug hub: echo, math, slow calls, failures, and connection control.</summary>
public class ChatHub : Hub
{
    private readonly ILogger<ChatHub> _logger;

    public ChatHub(ILogger<ChatHub> logger)
    {
        _logger = logger;
    }

    public string Echo(string text)
    {
        _logger.LogInformation("ChatHub.Echo({Text})", text);
        return text;
    }

    public int Add(int a, int b)
    {
        _logger.LogInformation("ChatHub.Add({A}, {B})", a, b);
        return a + b;
    }

    public async Task<string> SlowEcho(string text, int delayMs)
    {
        _logger.LogInformation("ChatHub.SlowEcho({Text}, {DelayMs})", text, delayMs);
        await Task.Delay(delayMs);
        return text;
    }

    public Task Fail()
    {
        _logger.LogInformation("ChatHub.Fail()");
        throw new HubException("intentional failure");
    }

    public async Task Ping()
    {
        _logger.LogInformation("ChatHub.Ping()");
        await Clients.All.SendAsync("Echoed", "ping", DateTime.UtcNow.ToString("O"));
    }

    public async Task Leave()
    {
        _logger.LogInformation("ChatHub.Leave() from {ConnectionId}", Context.ConnectionId);
        await Clients.All.SendAsync("Left", Context.ConnectionId);
    }

    public Task KillConnection()
    {
        _logger.LogInformation("ChatHub.KillConnection() for {ConnectionId}", Context.ConnectionId);
        Context.Abort();
        return Task.CompletedTask;
    }

    public string ConnectionId()
    {
        _logger.LogInformation("ChatHub.ConnectionId() -> {ConnectionId}", Context.ConnectionId);
        return Context.ConnectionId ?? string.Empty;
    }
}
