using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace Server.Hubs;

public record ChatMessage(string RoomId, string User, string Text, DateTimeOffset SentAt);

/// <summary>Teaching hub: chat rooms built on SignalR groups.</summary>
public class RoomHub : Hub
{
    private const int HistoryLimit = 50;
    private static readonly ConcurrentDictionary<string, Queue<ChatMessage>> History = new();

    // Adding a connection that is already in the group changes nothing, so the client can retry.
    public Task JoinRoom(string roomId) => Groups.AddToGroupAsync(Context.ConnectionId, roomId);

    public Task LeaveRoom(string roomId) => Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId);

    public Task SendMessage(string roomId, string text)
    {
        var message = new ChatMessage(roomId, Context.User?.Identity?.Name ?? "anonymous", text, DateTimeOffset.UtcNow);
        var history = History.GetOrAdd(roomId, _ => new Queue<ChatMessage>());
        lock (history)
        {
            history.Enqueue(message);
            if (history.Count > HistoryLimit) history.Dequeue();
        }
        return Clients.Group(roomId).SendAsync("MessageReceived", message);
    }

    public ChatMessage[] GetHistory(string roomId)
    {
        if (!History.TryGetValue(roomId, out var history)) return [];
        lock (history) return history.ToArray();
    }
}
