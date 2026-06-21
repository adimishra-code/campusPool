import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../services/api.js";

// The JWT now lives only in an httpOnly cookie (set by the server, sent
// automatically with `withCredentials`). JavaScript never sees or stores it, so
// XSS cannot steal the session. We cache only the non-sensitive user profile for
// instant first paint — the cookie is the source of truth, re-validated on load
// via fetchMe().
const cachedUser = JSON.parse(localStorage.getItem("user") || "null");

const errMsg = (err) => err.response?.data?.message || err.message || "Request failed";

// Helper to build a thunk that POSTs and returns the response data.
const post = (name, url) =>
  createAsyncThunk(`auth/${name}`, async (payload, { rejectWithValue }) => {
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

export const setTwoFactor = createAsyncThunk(
  "auth/setTwoFactor",
  async (enabled, { rejectWithValue }) => {
    try {
      const { data } = await api.patch("/auth/2fa", { enabled });
      return data;
    } catch (err) {
      return rejectWithValue(errMsg(err));
    }
  }
);

// Refresh the signed-in profile AND validate the session cookie. Used to
// bootstrap auth state on app load and to keep the profile/verification badge
// fresh. A rejection means there is no valid session (logged out / expired).
export const fetchMe = createAsyncThunk("auth/fetchMe", async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get("/auth/me");
    return data;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

// Logout clears the httpOnly cookie server-side, then wipes client state.
export const logoutUser = createAsyncThunk("auth/logoutUser", async (_, { dispatch }) => {
  try {
    await api.post("/auth/logout");
  } catch {
    // Even if the request fails (e.g. already expired), clear local state.
  } finally {
    dispatch(logout());
  }
});

// A token-issuing response (login / verify-email / 2FA) confirms the cookie was
// set by the server; we adopt the returned user profile. The JWT in the body is
// intentionally ignored — the browser relies on the cookie.
function adoptSession(state, user) {
  state.user = user;
  state.authenticated = true;
  localStorage.setItem("user", JSON.stringify(user));
}

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: cachedUser,
    authenticated: false, // not trusted until fetchMe confirms the cookie
    bootstrapped: false, // becomes true after the initial session check
    verification: null,
    status: "idle",
    error: null
  },
  reducers: {
    logout(state) {
      state.user = null;
      state.authenticated = false;
      state.verification = null;
      state.status = "idle";
      state.error = null;
      localStorage.removeItem("user");
    },
    clearAuthError(state) {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    // Token-issuing thunks confirm an authenticated session (cookie is set).
    [login, verifyEmail, verifyLoginOtp].forEach((thunk) => {
      builder.addCase(thunk.fulfilled, (state, { payload }) => {
        state.status = "succeeded";
        // payload.token present == full session; else needs verification / 2FA.
        if (payload?.token && payload?.user) adoptSession(state, payload.user);
      });
    });

    builder
      .addCase(register.fulfilled, (state) => {
        state.status = "succeeded";
      })
      .addCase(setTwoFactor.fulfilled, (state, { payload }) => {
        if (state.user) state.user = { ...state.user, twoFactorEnabled: payload.twoFactorEnabled };
      })
      .addCase(fetchMe.fulfilled, (state, { payload }) => {
        state.user = { ...state.user, ...payload.user };
        state.authenticated = true;
        state.bootstrapped = true;
        state.verification = payload.verification || null;
        localStorage.setItem("user", JSON.stringify(state.user));
      })
      .addCase(fetchMe.rejected, (state) => {
        // No valid session cookie — present as logged out.
        state.user = null;
        state.authenticated = false;
        state.bootstrapped = true;
        state.verification = null;
        localStorage.removeItem("user");
      });

    // Generic pending/rejected for every auth thunk that drives the auth UI.
    [
      login,
      register,
      verifyEmail,
      resendVerification,
      verifyLoginOtp,
      forgotPassword,
      resetPassword
    ].forEach((thunk) => {
      builder
        .addCase(thunk.pending, (state) => {
          state.status = "loading";
          state.error = null;
        })
        .addCase(thunk.rejected, (state, { payload }) => {
          state.status = "failed";
          state.error = payload;
        });
    });
  }
});

export const { logout, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
