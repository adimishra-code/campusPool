import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { setAuthToken } from "../services/api.js";

const storedToken = localStorage.getItem("token");
if (storedToken) setAuthToken(storedToken);

const errMsg = (err) => err.response?.data?.message || err.message || "Request failed";

// Helper to build a thunk that POSTs and returns the response data.
const post = (name, url) => createAsyncThunk(`auth/${name}`, async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post(url, payload);
    return data;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

// Login is special: a 403 "email not verified" is a next step in the flow, not
// an error — surface its payload (needsEmailVerification/email/previewOtp) to the UI.
export const login = createAsyncThunk("auth/login", async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post("/auth/login", payload);
    return data;
  } catch (err) {
    const data = err.response?.data;
    if (data?.needsEmailVerification) return data;
    return rejectWithValue(errMsg(err));
  }
});

export const register = post("register", "/auth/register");
export const verifyEmail = post("verifyEmail", "/auth/verify-email");
export const resendVerification = post("resendVerification", "/auth/resend-verification");
export const verifyLoginOtp = post("verifyLoginOtp", "/auth/login/verify-otp");
export const forgotPassword = post("forgotPassword", "/auth/forgot-password");
export const resetPassword = post("resetPassword", "/auth/reset-password");

export const setTwoFactor = createAsyncThunk("auth/setTwoFactor", async (enabled, { rejectWithValue }) => {
  try {
    const { data } = await api.patch("/auth/2fa", { enabled });
    return data;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

// Refresh the signed-in profile (used by Profile page + verification badge).
export const fetchMe = createAsyncThunk("auth/fetchMe", async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get("/auth/me");
    return data;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

function persist(state, payload) {
  state.token = payload.token;
  state.user = payload.user;
  localStorage.setItem("token", payload.token);
  localStorage.setItem("user", JSON.stringify(payload.user));
  setAuthToken(payload.token);
}

// Persist a token issued out-of-band (OAuth redirect) — the user object is then
// hydrated via fetchMe().
function persistToken(state, token) {
  state.token = token;
  localStorage.setItem("token", token);
  setAuthToken(token);
}

const authSlice = createSlice({
  name: "auth",
  initialState: {
    token: storedToken,
    user: JSON.parse(localStorage.getItem("user") || "null"),
    verification: null,
    status: "idle",
    error: null
  },
  reducers: {
    logout(state) {
      state.token = null;
      state.user = null;
      state.verification = null;
      state.status = "idle";
      state.error = null;
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setAuthToken(null);
    },
    clearAuthError(state) {
      state.error = null;
    },
    sessionFromToken(state, { payload }) {
      persistToken(state, payload);
      state.status = "succeeded";
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    // Token-issuing thunks persist a full session.
    [login, verifyEmail, verifyLoginOtp].forEach((thunk) => {
      builder.addCase(thunk.fulfilled, (state, { payload }) => {
        state.status = "succeeded";
        if (payload?.token) persist(state, payload); // else: needs verification / 2FA — handled by the page
      });
    });

    builder
      .addCase(register.fulfilled, (state) => { state.status = "succeeded"; })
      .addCase(setTwoFactor.fulfilled, (state, { payload }) => {
        if (state.user) state.user = { ...state.user, twoFactorEnabled: payload.twoFactorEnabled };
      })
      .addCase(fetchMe.fulfilled, (state, { payload }) => {
        state.user = { ...state.user, ...payload.user };
        state.verification = payload.verification || null;
        localStorage.setItem("user", JSON.stringify(state.user));
      });

    // Generic pending/rejected for every auth thunk that drives the auth UI.
    [login, register, verifyEmail, resendVerification, verifyLoginOtp, forgotPassword, resetPassword].forEach((thunk) => {
      builder
        .addCase(thunk.pending, (state) => { state.status = "loading"; state.error = null; })
        .addCase(thunk.rejected, (state, { payload }) => { state.status = "failed"; state.error = payload; });
    });
  }
});

export const { logout, clearAuthError, sessionFromToken } = authSlice.actions;
export default authSlice.reducer;
