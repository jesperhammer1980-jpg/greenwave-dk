const SOURCE = "myrenault";
const FALLBACK_MESSAGE = "MyRenault ikke tilsluttet · Manuel batteristatus bruges.";
const CONNECTED_MESSAGE = "Batteristatus fra MyRenault";
const DEFAULT_GIGYA_BASE_URL = "https://accounts.eu1.gigya.com";
const DEFAULT_KAMEREON_BASE_URL = "https://api-wired-prod-1-euw1.wrd-aws.com";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_STALE_MINUTES = 2880;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json(failure("method-not-allowed", "GET only"));
  }

  try {
    const config = readConfig();
    const missing = missingConfig(config);
    if (missing.length) {
      return res.status(200).json(failure("missing-env", FALLBACK_MESSAGE));
    }

    const auth = await authenticate(config);
    const accountId = config.accountId || await fetchAccountId(config, auth);
    if (!accountId) {
      return res.status(200).json(failure("account-not-found", FALLBACK_MESSAGE));
    }

    const vin = config.vin || await fetchVin(config, auth, accountId);
    if (!vin) {
      return res.status(200).json(failure("vehicle-not-found", FALLBACK_MESSAGE));
    }

    const batteryData = await fetchBatteryStatus(config, auth, accountId, vin);
    const normalized = normalizeBatteryStatus(batteryData, config.staleMinutes);
    if (!normalized || !isValidBatteryLevel(normalized.batteryLevel)) {
      return res.status(200).json(failure("battery-status-missing", FALLBACK_MESSAGE));
    }

    return res.status(200).json({
      ok: !normalized.stale,
      source: SOURCE,
      status: normalized.stale ? "stale" : "connected",
      message: normalized.stale ? FALLBACK_MESSAGE : CONNECTED_MESSAGE,
      batteryLevel: normalized.batteryLevel,
      batteryAutonomy: normalized.batteryAutonomy,
      batteryAvailableEnergy: normalized.batteryAvailableEnergy,
      plugStatus: normalized.plugStatus,
      chargingStatus: normalized.chargingStatus,
      timestamp: normalized.timestamp,
      ageMinutes: normalized.ageMinutes,
      stale: normalized.stale
    });
  } catch (error) {
    console.warn("MyRenault probe failed:", safeError(error));
    return res.status(200).json(failure(safeError(error), FALLBACK_MESSAGE));
  }
}

function readConfig() {
  const env = process.env;
  return {
    email: clean(env.MYRENAULT_EMAIL),
    password: clean(env.MYRENAULT_PASSWORD),
    loginToken: clean(env.MYRENAULT_LOGIN_TOKEN || env.MYRENAULT_GIGYA_LOGIN_TOKEN),
    gigyaApiKey: clean(env.MYRENAULT_GIGYA_API_KEY),
    kamereonApiKey: clean(env.MYRENAULT_KAMEREON_API_KEY),
    country: clean(env.MYRENAULT_COUNTRY) || "DK",
    locale: clean(env.MYRENAULT_LOCALE) || "da_DK",
    vin: clean(env.MYRENAULT_VIN),
    accountId: clean(env.MYRENAULT_ACCOUNT_ID),
    personId: clean(env.MYRENAULT_PERSON_ID),
    gigyaBaseUrl: clean(env.MYRENAULT_GIGYA_BASE_URL) || DEFAULT_GIGYA_BASE_URL,
    kamereonBaseUrl: clean(env.MYRENAULT_KAMEREON_BASE_URL) || DEFAULT_KAMEREON_BASE_URL,
    staleMinutes: positiveNumber(env.MYRENAULT_STALE_MINUTES, DEFAULT_STALE_MINUTES)
  };
}

function missingConfig(config) {
  const missing = [];
  if (!config.gigyaApiKey) missing.push("MYRENAULT_GIGYA_API_KEY");
  if (!config.kamereonApiKey) missing.push("MYRENAULT_KAMEREON_API_KEY");
  if (!config.loginToken && (!config.email || !config.password)) {
    missing.push("MYRENAULT_EMAIL/MYRENAULT_PASSWORD or MYRENAULT_LOGIN_TOKEN");
  }
  return missing;
}

async function authenticate(config) {
  let loginToken = config.loginToken;
  let personId = config.personId;

  if (!loginToken) {
    const login = await gigyaPost(config, "accounts.login", {
      loginID: config.email,
      password: config.password,
      include: "profile,data,sessionInfo"
    });
    loginToken = extractLoginToken(login);
    personId = personId || extractPersonId(login);
  }

  if (!loginToken) {
    throw safeStatusError("login-token-missing");
  }

  const jwt = await gigyaPost(config, "accounts.getJWT", {
    login_token: loginToken,
    fields: "data.personId,data.personID,data.gigyaDataCenter"
  });
  const idToken = clean(jwt?.id_token || jwt?.idToken || jwt?.jwt);
  personId = personId || extractPersonId(jwt);

  if (!personId) {
    const accountInfo = await gigyaPost(config, "accounts.getAccountInfo", {
      login_token: loginToken,
      include: "data,profile"
    });
    personId = extractPersonId(accountInfo);
  }

  if (!idToken) {
    throw safeStatusError("jwt-missing");
  }

  return { idToken, personId };
}

async function gigyaPost(config, endpoint, params) {
  return httpJson(`${config.gigyaBaseUrl.replace(/\/$/, "")}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ apiKey: config.gigyaApiKey, ...params }).toString()
  });
}

async function fetchAccountId(config, auth) {
  const personId = config.personId || auth.personId;
  if (!personId) return null;
  const data = await kamereonGet(config, auth, `/commerce/v1/persons/${encodeURIComponent(personId)}`);
  return extractAccountId(data);
}

async function fetchVin(config, auth, accountId) {
  const data = await kamereonGet(config, auth, `/commerce/v1/accounts/${encodeURIComponent(accountId)}/vehicles`);
  return extractVin(data);
}

async function fetchBatteryStatus(config, auth, accountId, vin) {
  return kamereonGet(
    config,
    auth,
    `/commerce/v1/accounts/${encodeURIComponent(accountId)}/kamereon/kca/car-adapter/v2/cars/${encodeURIComponent(vin)}/battery-status`
  );
}

async function kamereonGet(config, auth, path) {
  const url = new URL(`${config.kamereonBaseUrl.replace(/\/$/, "")}${path}`);
  url.searchParams.set("country", config.country);
  return httpJson(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      "apikey": config.kamereonApiKey,
      "x-gigya-id_token": auth.idToken
    }
  });
}

async function httpJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw safeStatusError(`upstream-${response.status}`, response.status, response.statusText);
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw safeStatusError("upstream-timeout");
    if (error instanceof SyntaxError) throw safeStatusError("invalid-json");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBatteryStatus(data, staleMinutes) {
  const attributes = data?.data?.attributes || data?.attributes || data?.data || data;
  const batteryLevel = finiteNumber(
    attributes?.batteryLevel ??
    attributes?.batterySoc ??
    attributes?.stateOfCharge ??
    attributes?.soc
  );
  if (!isValidBatteryLevel(batteryLevel)) return null;

  const timestamp = clean(
    attributes?.timestamp ||
    attributes?.lastUpdateTime ||
    attributes?.lastEnergyUpdateTimestamp ||
    attributes?.lastBatteryStatusTimestamp
  );
  const ageMinutes = timestamp ? ageInMinutes(timestamp) : null;
  const stale = Number.isFinite(ageMinutes) ? ageMinutes > staleMinutes : false;

  return {
    batteryLevel,
    batteryAutonomy: finiteNumberOrNull(attributes?.batteryAutonomy),
    batteryAvailableEnergy: finiteNumberOrNull(attributes?.batteryAvailableEnergy),
    plugStatus: safeScalar(attributes?.plugStatus),
    chargingStatus: safeScalar(attributes?.chargingStatus),
    timestamp: timestamp || null,
    ageMinutes: Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null,
    stale
  };
}

function extractLoginToken(data) {
  return clean(
    data?.login_token ||
    data?.loginToken ||
    data?.sessionInfo?.cookieValue ||
    data?.sessionInfo?.login_token ||
    data?.sessionInfo?.loginToken
  );
}

function extractPersonId(data) {
  return clean(
    data?.data?.personId ||
    data?.data?.personID ||
    data?.profile?.personId ||
    data?.profile?.personID ||
    data?.personId ||
    data?.personID
  );
}

function extractAccountId(data) {
  const containers = [
    data?.accounts,
    data?.data?.accounts,
    data?.data?.attributes?.accounts,
    data?.attributes?.accounts
  ].flatMap(value => Array.isArray(value) ? value : value ? [value] : []);

  for (const account of containers) {
    const id = clean(account?.accountId || account?.accountID || account?.account_id || account?.id);
    if (id) return id;
  }

  return findFirstStringByKey(data, key => /account_?id|kamereonAccountId/i.test(key));
}

function extractVin(data) {
  return findFirstStringByKey(data, key => /^vin$|^id$|vehicleIdentificationNumber/i.test(key), isVin) ||
    findFirstStringValue(data, isVin);
}

function findFirstStringByKey(value, keyPredicate, valuePredicate = value => Boolean(value)) {
  const seen = new Set();
  const walk = item => {
    if (!item || typeof item !== "object" || seen.has(item)) return null;
    seen.add(item);
    for (const [key, value] of Object.entries(item)) {
      const str = clean(value);
      if (keyPredicate(key) && str && valuePredicate(str)) return str;
      const nested = walk(value);
      if (nested) return nested;
    }
    return null;
  };
  return walk(value);
}

function findFirstStringValue(value, valuePredicate) {
  const seen = new Set();
  const walk = item => {
    const str = clean(item);
    if (str && valuePredicate(str)) return str;
    if (!item || typeof item !== "object" || seen.has(item)) return null;
    seen.add(item);
    for (const value of Object.values(item)) {
      const nested = walk(value);
      if (nested) return nested;
    }
    return null;
  };
  return walk(value);
}

function failure(status, message) {
  return {
    ok: false,
    source: SOURCE,
    status,
    message: message || FALLBACK_MESSAGE,
    batteryLevel: null,
    batteryAutonomy: null,
    batteryAvailableEnergy: null,
    plugStatus: null,
    chargingStatus: null,
    timestamp: null,
    ageMinutes: null,
    stale: true
  };
}

function safeStatusError(status, httpStatus = null, statusText = "") {
  const error = new Error(status);
  error.safeStatus = status;
  error.httpStatus = httpStatus;
  error.statusText = statusText;
  return error;
}

function safeError(error) {
  if (error?.safeStatus) return error.safeStatus;
  if (error?.httpStatus) return `upstream-${error.httpStatus}`;
  return "myrenault-unavailable";
}

function clean(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function finiteNumberOrNull(value) {
  const number = finiteNumber(value);
  return Number.isFinite(number) ? number : null;
}

function isValidBatteryLevel(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
}

function isVin(value) {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(value);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function ageInMinutes(timestamp) {
  const date = new Date(timestamp);
  const ms = Date.now() - date.getTime();
  return Number.isFinite(ms) ? ms / 60000 : null;
}

function safeScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return clean(String(value)).slice(0, 80) || null;
}
