import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../services/api.js";

// Session JWT is stored in an httpOnly cookie. JavaScript cannot access it, preventing XSS.
// The user profile is cached locally for faster initial paint.
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
export const becomeHost = post("becomeHost", "/users/me/become-host");

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

// Refreshes the user profile and validates the session cookie.
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

// Adopts the session when a successful login/verification response is received.
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

    // Non-session successes (no token issued): clear the loading state so the
    // submit button doesn't stick on "Please wait…". Without a .fulfilled case,
    // .pending leaves status at "loading" and a successful 200 never resets it
    // (this was the reset-password / forgot-password "stuck" bug).
    [register, forgotPassword, resetPassword].forEach((thunk) => {
      builder.addCase(thunk.fulfilled, (state) => {
        state.status = "succeeded";
      });
    });

    builder
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
