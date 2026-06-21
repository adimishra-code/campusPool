import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../services/api.js";
import { trackEvent } from "../services/tracking.js";

const errMsg = (err) => err.response?.data?.message || err.message || "Something went wrong";

// Browse available trips — the API ranks them by match score and returns
// matchScore/breakdown on each trip.
export const fetchTrips = createAsyncThunk("trips/fetchTrips", async (params = {}, { rejectWithValue }) => {
  try {
    const query = {};
    if (params.date) query.date = params.date;
    if (params.pickup) { query.pickupLng = params.pickup[0]; query.pickupLat = params.pickup[1]; }
    if (params.destination) { query.destLng = params.destination[0]; query.destLat = params.destination[1]; }
    const { data } = await api.get("/trips/find", { params: query });
    const scores = {};
    (data.trips || []).forEach((t) => { if (typeof t.matchScore === "number") scores[t._id] = t.matchScore; });
    return { trips: data.trips || [], total: data.total || 0, scores };
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

export const fetchRecommendations = createAsyncThunk("trips/fetchRecommendations", async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get("/trips/recommendations", { params: { limit: 20 } });
    return data.recommendations || [];
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

// Fire-and-forget recommendation-click analytics.
export const trackClick = createAsyncThunk("trips/trackClick", async ({ id, matchScore }) => {
  try { await api.post(`/trips/${id}/click`, { matchScore }); } catch { /* non-blocking */ }
  return true;
});

export const fetchTrip = createAsyncThunk("trips/fetchTrip", async (id, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/trips/${id}`);
    return data; // { trip, match }
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

export const offerTrip = createAsyncThunk("trips/offerTrip", async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post("/trips/offer", payload);
    trackEvent("trip_offer", { tripId: data.trip?.id });
    return data.trip;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

export const joinTrip = createAsyncThunk("trips/joinTrip", async ({ id, notes }, { rejectWithValue, dispatch }) => {
  try {
    const { data } = await api.post(`/trips/${id}/join`, { notes });
    trackEvent("trip_join", { tripId: id });
    dispatch(fetchTrip(id));
    return data;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

export const cancelJoin = createAsyncThunk("trips/cancelJoin", async (id, { rejectWithValue, dispatch }) => {
  try {
    const { data } = await api.post(`/trips/${id}/leave`);
    dispatch(fetchTrip(id));
    return data;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

export const approvePassenger = createAsyncThunk("trips/approvePassenger", async ({ id, userId }, { rejectWithValue, dispatch }) => {
  try {
    const { data } = await api.post(`/trips/${id}/approve/${userId}`);
    dispatch(fetchTrip(id));
    return data;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

export const rejectPassenger = createAsyncThunk("trips/rejectPassenger", async ({ id, userId, reason }, { rejectWithValue, dispatch }) => {
  try {
    const { data } = await api.post(`/trips/${id}/reject/${userId}`, { reason });
    dispatch(fetchTrip(id));
    return data;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

export const cancelTrip = createAsyncThunk("trips/cancelTrip", async ({ id, reason }, { rejectWithValue, dispatch }) => {
  try {
    const { data } = await api.post(`/trips/${id}/cancel`, { reason });
    dispatch(fetchTrip(id));
    return data;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

export const fetchMyTrips = createAsyncThunk("trips/fetchMyTrips", async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get("/users/me/trips");
    return data;
  } catch (err) {
    return rejectWithValue(errMsg(err));
  }
});

const initialState = {
  feed: { items: [], total: 0, scores: {}, status: "idle", error: null },
  recommendations: { items: [], status: "idle", error: null },
  current: { trip: null, match: null, status: "idle", error: null },
  mine: { hosted: [], joined: [], pending: [], completed: [], counts: {}, status: "idle", error: null },
  offer: { status: "idle", error: null },
  action: { status: "idle", error: null }
};

const ACTION_THUNKS = ["joinTrip", "cancelJoin", "approvePassenger", "rejectPassenger", "cancelTrip"];
const isActionType = (suffix) => (a) => a.type.startsWith("trips/") && a.type.endsWith(`/${suffix}`) && ACTION_THUNKS.some((t) => a.type.includes(t));

const tripSlice = createSlice({
  name: "trips",
  initialState,
  reducers: {
    clearActionState(state) {
      state.action = { status: "idle", error: null };
      state.offer = { status: "idle", error: null };
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTrips.pending, (state) => { state.feed.status = "loading"; state.feed.error = null; })
      .addCase(fetchTrips.fulfilled, (state, { payload }) => {
        state.feed.status = "succeeded";
        state.feed.items = payload.trips;
        state.feed.total = payload.total;
        state.feed.scores = payload.scores;
      })
      .addCase(fetchTrips.rejected, (state, { payload }) => { state.feed.status = "failed"; state.feed.error = payload; })

      .addCase(fetchRecommendations.pending, (state) => { state.recommendations.status = "loading"; state.recommendations.error = null; })
      .addCase(fetchRecommendations.fulfilled, (state, { payload }) => { state.recommendations.status = "succeeded"; state.recommendations.items = payload; })
      .addCase(fetchRecommendations.rejected, (state, { payload }) => { state.recommendations.status = "failed"; state.recommendations.error = payload; })

      .addCase(fetchTrip.pending, (state) => { state.current.status = "loading"; state.current.error = null; })
      .addCase(fetchTrip.fulfilled, (state, { payload }) => { state.current.status = "succeeded"; state.current.trip = payload.trip; state.current.match = payload.match || null; })
      .addCase(fetchTrip.rejected, (state, { payload }) => { state.current.status = "failed"; state.current.error = payload; })

      .addCase(offerTrip.pending, (state) => { state.offer.status = "loading"; state.offer.error = null; })
      .addCase(offerTrip.fulfilled, (state) => { state.offer.status = "succeeded"; })
      .addCase(offerTrip.rejected, (state, { payload }) => { state.offer.status = "failed"; state.offer.error = payload; })

      .addCase(fetchMyTrips.pending, (state) => { state.mine.status = "loading"; state.mine.error = null; })
      .addCase(fetchMyTrips.fulfilled, (state, { payload }) => {
        state.mine.status = "succeeded";
        state.mine.hosted = payload.hosted || [];
        state.mine.joined = payload.joined || [];
        state.mine.pending = payload.pending || [];
        state.mine.completed = payload.completed || [];
        state.mine.counts = payload.counts || {};
      })
      .addCase(fetchMyTrips.rejected, (state, { payload }) => { state.mine.status = "failed"; state.mine.error = payload; })

      .addMatcher(isActionType("pending"), (state) => { state.action = { status: "loading", error: null }; })
      .addMatcher(isActionType("fulfilled"), (state) => { state.action = { status: "succeeded", error: null }; })
      .addMatcher(isActionType("rejected"), (state, { payload }) => { state.action = { status: "failed", error: payload }; });
  }
});

export const { clearActionState } = tripSlice.actions;
export default tripSlice.reducer;
