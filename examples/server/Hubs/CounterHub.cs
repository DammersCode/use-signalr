using Microsoft.AspNetCore.SignalR;

namespace Server.Hubs;

/// <summary>Debug hub: a server-owned counter, broadcast every 2 s.</summary>
public class CounterHub : Hub
{
    private readonly ILogger<CounterHub> _logger;
    private readonly Broadcaster _broadcaster;

    public CounterHub(ILogger<CounterHub> logger, Broadcaster broadcaster)
    {
        _logger = logger;
        _broadcaster = broadcaster;
    }

    public Task Reset()
    {
        _logger.LogInformation("CounterHub.Reset()");
        _broadcaster.ResetCounter();
        return Task.CompletedTask;
    }
}
