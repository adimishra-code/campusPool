import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../services/api.js";

const unreadCount = (items) => items.filter((n) => !n.readAt).length;

export const fetchNotifications = createAsyncThunk("notifications/fetch", async () => {
  const { data } = await api.get("/notifications");
  return data.notifications || [];
});

export const markNotificationRead = createAsyncThunk("notifications/markRead", async (id) => {
  await api.patch(`/notifications/${id}/read`);
  return id;
});

export const markAllNotificationsRead = createAsyncThunk("notifications/markAllRead", async () => {
  await api.patch("/notifications/read-all");
});

const notificationSlice = createSlice({
  name: "notifications",
  initialState: { items: [], unread: 0, status: "idle" },
  reducers: {
    // A live notification arrived over the socket.
    notificationReceived(state, { payload }) {
      if (state.items.some((n) => n._id === payload._id)) return;
      state.items.unshift(payload);
      state.unread = unreadCount(state.items);
    },
    notificationsReset(state) {
      state.items = [];
      state.unread = 0;
      state.status = "idle";
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchNotifications.fulfilled, (state, { payload }) => {
        state.status = "succeeded";
        state.items = payload;
        state.unread = unreadCount(payload);
      })
      .addCase(markNotificationRead.fulfilled, (state, { payload: id }) => {
        const n = state.items.find((x) => x._id === id);
        if (n && !n.readAt) n.readAt = new Date().toISOString();
        state.unread = unreadCount(state.items);
      })
      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        const now = new Date().toISOString();
        state.items.forEach((n) => {
          if (!n.readAt) n.readAt = now;
        });
        state.unread = 0;
      });
  }
});

export const { notificationReceived, notificationsReset } = notificationSlice.actions;
export default notificationSlice.reducer;
