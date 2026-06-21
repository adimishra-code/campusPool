import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../services/api.js";

const errMsg = (err) => err.response?.data?.message || err.message || "Chat error";

export const fetchMessages = createAsyncThunk("chat/fetch", async (tripId, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/trips/${tripId}/messages`);
    return data.messages || [];
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

export const sendMessage = createAsyncThunk("chat/send", async ({ tripId, body }, { rejectWithValue }) => {
  try {
    const { data } = await api.post(`/trips/${tripId}/messages`, { body });
    return data.message;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

const chatSlice = createSlice({
  name: "chat",
  initialState: { messages: [], status: "idle", error: null },
  reducers: {
    // Append a message that arrived over the socket (dedupe by id).
    messageReceived(state, { payload }) {
      if (!state.messages.some((m) => m._id === payload._id)) state.messages.push(payload);
    },
    resetChat(state) {
      state.messages = [];
      state.status = "idle";
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMessages.pending, (state) => { state.status = "loading"; state.error = null; })
      .addCase(fetchMessages.fulfilled, (state, { payload }) => { state.status = "succeeded"; state.messages = payload; })
      .addCase(fetchMessages.rejected, (state, { payload }) => { state.status = "failed"; state.error = payload; })
      .addCase(sendMessage.fulfilled, (state, { payload }) => {
        if (!state.messages.some((m) => m._id === payload._id)) state.messages.push(payload);
      });
  }
});

export const { messageReceived, resetChat } = chatSlice.actions;
export default chatSlice.reducer;
