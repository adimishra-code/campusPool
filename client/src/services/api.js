import axios from "axios";

// `withCredentials` makes the browser send (and accept) the httpOnly auth cookie
// on every request. The JWT is never read or stored by JavaScript, so an XSS
// payload cannot exfiltrate the session.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true
});

export default api;
