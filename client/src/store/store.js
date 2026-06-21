import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice.js";
import tripReducer from "./tripSlice.js";
import chatReducer from "./chatSlice.js";
import themeReducer from "./themeSlice.js";
import notificationReducer from "./notificationSlice.js";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    trips: tripReducer,
    chat: chatReducer,
    theme: themeReducer,
    notifications: notificationReducer
  }
});
