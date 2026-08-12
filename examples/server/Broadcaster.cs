using Microsoft.AspNetCore.SignalR;
using Server.Hubs;

namespace Server;

/// <summary>Ticks ChatHub every 1 s and CounterHub every 2 s, each with its own counter.</summary>
public class Broadcaster : BackgroundService
{
    private readonly IHubContext<ChatHub> _chat;
    private readonly IHubContext<CounterHub> _counter;
    private readonly ILogger<Broadcaster> _logger;
    private int _tickCount;
    private int _counterValue;

    public Broadcaster(
        IHubContext<ChatHub> chat,
        IHubContext<CounterHub> counter,
        ILogger<Broadcaster> logger)
    {
        _chat = chat;
        _counter = counter;
        _logger = logger;
    }

    public void ResetCounter() => _counterValue = 0;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var counterTicks = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(1000, stoppingToken);
            _tickCount++;
            await _chat.Clients.All.SendAsync("Tick", _tickCount, DateTime.UtcNow.ToString("O"), stoppingToken);
            _logger.LogInformation("Broadcaster.Tick({Count})", _tickCount);

            counterTicks++;
            if (counterTicks % 2 == 0)
            {
                _counterValue++;
                await _counter.Clients.All.SendAsync("Count", _counterValue, stoppingToken);
                _logger.LogInformation("Broadcaster.Count({Value})", _counterValue);
            }
        }
    }
}
