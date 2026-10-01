using Microsoft.AspNetCore.SignalR;

namespace Server.Hubs;

/// <summary>Teaching hub: tells every client how many connections are online.</summary>
public class PresenceHub : Hub
{
    private static int _online;

    public override async Task OnConnectedAsync()
    {
        await Clients.All.SendAsync("OnlineCount", Interlocked.Increment(ref _online));
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await Clients.All.SendAsync("OnlineCount", Interlocked.Decrement(ref _online));
        await base.OnDisconnectedAsync(exception);
    }
}
