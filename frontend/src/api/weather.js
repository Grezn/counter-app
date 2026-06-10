import { buildQuery, requestJson } from "./client";

export function getLocalWeather(params = {}) {
  return requestJson(`/api/weather/local${buildQuery(params)}`);
}
