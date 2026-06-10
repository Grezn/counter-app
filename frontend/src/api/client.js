export class ApiRequestError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status || 0;
    this.data = options.data || {};
  }
}

export function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });

  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function requestJson(path, options = {}) {
  const { headers = {}, json, ...fetchOptions } = options;
  const requestHeaders = {
    Accept: "application/json",
    ...headers,
  };
  const requestOptions = {
    cache: "no-store",
    ...fetchOptions,
    headers: requestHeaders,
  };

  if (json !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    requestOptions.body = JSON.stringify(json);
  }

  const res = await fetch(path, requestOptions);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiRequestError(data.error || `Request failed with ${res.status}`, {
      status: res.status,
      data,
    });
  }

  return data;
}
