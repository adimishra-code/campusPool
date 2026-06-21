import Notification from "../models/Notification.js";

export async function notifyUser(io, userId, payload) {
  const notification = await Notification.create({ user: userId, ...payload });
  io?.to(`user:${userId}`).emit("notification:new", notification);
  return notification;
}
