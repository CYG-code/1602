const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const https = require("https");
const {
  mapKey = "",
  mapSk = "",
  radius = 3000,
  pageSize = 20,
  adminOpenids = [],
} = require("./config.json");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString("utf8");
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSignedQuery(path, params) {
  const entries = Object.keys(params)
    .sort()
    .map((key) => [key, params[key]]);

  const rawQuery = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const encodedQuery = entries
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  const sig = crypto
    .createHash("md5")
    .update(`${path}?${rawQuery}${mapSk}`, "utf8")
    .digest("hex");

  return `${encodedQuery}&sig=${sig}`;
}

function toNumber(value, defaultValue = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeImageList(value, max = 3) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, max);
}

function isAdmin(openid) {
  return !!openid && Array.isArray(adminOpenids) && adminOpenids.includes(openid);
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
}

function normalizeRemoteShop(item) {
  const latitude = toNumber(item.location && item.location.lat, NaN);
  const longitude = toNumber(item.location && item.location.lng, NaN);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    sourceId: String(item.id || item.sourceId),
    name: item.title || item.name || "\u672a\u547d\u540d\u5e97\u94fa",
    address: item.address || "",
    phone: item.tel || "",
    category: item.category || "\u7f8e\u98df",
    avgRating: toNumber(item.avgRating, 0),
    avgPrice: toNumber(item.avgPrice, 0),
    checkinCount: toNumber(item.checkinCount, 0),
    images: [],
    distance: toNumber(item._distance || item.distance, 0),
    latitude,
    longitude,
    location: new db.Geo.Point(longitude, latitude),
    source: "map",
    rawData: item,
    updatedAt: db.serverDate(),
  };
}

function shapeShopForClient(shop, latitude, longitude) {
  const lat = toNumber(shop.latitude, NaN);
  const lng = toNumber(shop.longitude, NaN);
  const distance =
    toNumber(shop.distance, 0) ||
    (Number.isFinite(lat) && Number.isFinite(lng)
      ? haversineDistance(latitude, longitude, lat, lng)
      : 0);

  return {
    _id: shop._id,
    sourceId: shop.sourceId || "",
    name: shop.name || "\u672a\u547d\u540d\u5e97\u94fa",
    address: shop.address || "",
    phone: shop.phone || "",
    category: shop.category || "\u7f8e\u98df",
    tags: Array.isArray(shop.tags) ? shop.tags : [],
    placeType: shop.placeType || "\u5e97\u94fa",
    avgRating: toNumber(shop.avgRating, 0),
    avgPrice: toNumber(shop.avgPrice, 0),
    checkinCount: toNumber(shop.checkinCount, 0),
    images: normalizeImageList(shop.images, 3),
    distance,
    location: {
      latitude: lat,
      longitude: lng,
    },
  };
}

function inPriceRange(avgPrice, priceRangeKey) {
  const price = toNumber(avgPrice, 0);
  if (!priceRangeKey || priceRangeKey === "all") {
    return true;
  }
  if (price <= 0) {
    return false;
  }

  switch (priceRangeKey) {
    case "0_30":
      return price <= 30;
    case "30_60":
      return price > 30 && price <= 60;
    case "60_100":
      return price > 60 && price <= 100;
    case "100_plus":
      return price > 100;
    default:
      return true;
  }
}

function hitCategory(shop, categoryFilters) {
  if (!Array.isArray(categoryFilters) || categoryFilters.length === 0) {
    return true;
  }

  const category = normalizeText(shop.category).toLowerCase();
  const tags = Array.isArray(shop.tags) ? shop.tags.map((item) => normalizeText(item).toLowerCase()) : [];
  const haystacks = [category, ...tags];

  return categoryFilters.some((filter) => {
    const key = normalizeText(filter).toLowerCase();
    if (!key || key === "全部") {
      return true;
    }
    return haystacks.some((field) => field.includes(key));
  });
}

function sortShops(shops, sortBy) {
  const list = [...shops];
  if (sortBy === "rating_desc") {
    return list.sort((a, b) => {
      const ratingDiff = toNumber(b.avgRating, 0) - toNumber(a.avgRating, 0);
      if (ratingDiff !== 0) {
        return ratingDiff;
      }
      return toNumber(a.distance, 0) - toNumber(b.distance, 0);
    });
  }

  return list.sort((a, b) => toNumber(a.distance, 0) - toNumber(b.distance, 0));
}

async function fetchRemoteByKeyword(latitude, longitude, keyword, searchRadiusMeters, fetchPageSize) {
  if (!mapKey || !mapSk) {
    return {
      source: "none",
      message: "\u672a\u914d\u7f6e\u817e\u8baf\u5730\u56fe Key/SK\uff0c\u65e0\u6cd5\u6267\u884c\u5730\u56fe\u68c0\u7d22\u3002",
      data: [],
    };
  }

  const path = "/ws/place/v1/search";
  const boundary = `nearby(${latitude},${longitude},${searchRadiusMeters},1)`;
  const signed = buildSignedQuery(path, {
    boundary,
    key: mapKey,
    keyword,
    page_size: String(fetchPageSize),
  });
  const url = `https://apis.map.qq.com${path}?${signed}`;
  const response = await requestJson(url);

  if (response.status !== 0) {
    throw new Error(response.message || "\u817e\u8baf\u5730\u56fe\u68c0\u7d22\u5931\u8d25");
  }

  return {
    source: "map",
    message: "",
    data: (response.data || []).map(normalizeRemoteShop).filter(Boolean),
  };
}

async function upsertRemoteShops(shops) {
  if (!shops.length) {
    return [];
  }

  const sourceIds = shops.map((shop) => shop.sourceId);
  const existing = await db
    .collection("shops")
    .where({
      sourceId: _.in(sourceIds),
    })
    .get();

  const existingMap = new Map((existing.data || []).map((item) => [item.sourceId, item]));
  const saved = [];

  for (const shop of shops) {
    const found = existingMap.get(shop.sourceId);
    if (found) {
      await db
        .collection("shops")
        .doc(found._id)
        .update({
          data: {
            ...shop,
            createdAt: found.createdAt || db.serverDate(),
          },
        });
      saved.push({ ...found, ...shop, _id: found._id });
      continue;
    }

    const createRes = await db.collection("shops").add({
      data: {
        ...shop,
        createdAt: db.serverDate(),
      },
    });
    saved.push({ ...shop, _id: createRes._id });
  }

  return saved;
}

async function queryLocalByKeyword(latitude, longitude, keyword, searchRadiusMeters, queryLimit) {
  const pattern = escapeRegExp(keyword);
  const result = await db
    .collection("shops")
    .where(
      _.or([
        { name: db.RegExp({ regexp: pattern, options: "i" }) },
        { address: db.RegExp({ regexp: pattern, options: "i" }) },
        { category: db.RegExp({ regexp: pattern, options: "i" }) },
      ])
    )
    .limit(queryLimit)
    .get();

  return (result.data || [])
    .map((item) => {
      const lat = toNumber(item.latitude, NaN);
      const lng = toNumber(item.longitude, NaN);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      const distance = haversineDistance(latitude, longitude, lat, lng);
      if (distance > searchRadiusMeters) {
        return null;
      }
      return {
        ...item,
        distance,
      };
    })
    .filter(Boolean);
}

async function searchShops(event) {
  const latitude = toNumber(event.latitude, NaN);
  const longitude = toNumber(event.longitude, NaN);
  const keyword = String(event.keyword || "").trim();
  const radiusKm = clamp(toNumber(event.radiusKm, radius / 1000 || 10), 1, 100);
  const resultLimit = clamp(toNumber(event.resultLimit, pageSize), 1, 50);
  const categoryFilters = Array.isArray(event.categoryFilters)
    ? event.categoryFilters.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const priceRangeKey = normalizeText(event.priceRangeKey || "all");
  const sortBy = normalizeText(event.sortBy || "distance_asc");
  const searchRadiusMeters = Math.round(radiusKm * 1000);
  const queryLimit = Math.max(100, resultLimit * 6);
  const fetchPageSize = clamp(Math.max(pageSize, resultLimit * 3), 1, 20);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("\u7f3a\u5c11\u6709\u6548\u7684\u7ecf\u7eac\u5ea6\u53c2\u6570");
  }
  if (!keyword) {
    return {
      message: "\u8bf7\u8f93\u5165\u5173\u952e\u8bcd\u540e\u518d\u68c0\u7d22",
      shops: [],
      options: { radiusKm, resultLimit },
    };
  }

  let remote = {
    source: "map",
    message: "",
    data: [],
  };

  try {
    remote = await fetchRemoteByKeyword(
      latitude,
      longitude,
      keyword,
      searchRadiusMeters,
      fetchPageSize
    );
  } catch (error) {
    remote = {
      source: "local",
      message: `\u5730\u56fe\u68c0\u7d22\u5931\u8d25\uff0c\u5df2\u56de\u9000\u672c\u5730\u68c0\u7d22\uff1a${error.message || "\u672a\u77e5\u9519\u8bef"}`,
      data: [],
    };
  }

  const savedRemote = await upsertRemoteShops(remote.data);
  const local = await queryLocalByKeyword(
    latitude,
    longitude,
    keyword,
    searchRadiusMeters,
    queryLimit
  );

  const seen = new Set();
  const merged = [];
  for (const item of [...savedRemote, ...local]) {
    const key = item._id || item.sourceId || `${item.name}-${item.address}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }

  const shops = merged
    .map((item) => shapeShopForClient(item, latitude, longitude))
    .filter((item) => item.distance <= searchRadiusMeters)
    .filter((item) => hitCategory(item, categoryFilters))
    .filter((item) => inPriceRange(item.avgPrice, priceRangeKey));

  const sortedShops = sortShops(shops, sortBy)
    .slice(0, resultLimit);

  return {
    source: remote.source,
    message: remote.message,
    shops: sortedShops,
    options: {
      radiusKm,
      resultLimit,
      categoryFilters,
      priceRangeKey,
      sortBy,
    },
  };
}

async function createCustomShop(event) {
  const latitude = toNumber(event.latitude, NaN);
  const longitude = toNumber(event.longitude, NaN);
  const name = String(event.name || "").trim();
  const tags = Array.isArray(event.tags)
    ? event.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];
  const category = String(event.category || tags[0] || "\u5176\u4ed6").trim();
  const placeType = String(event.placeType || "\u5e97\u94fa").trim();
  const address = String(event.address || "").trim();
  const phone = String(event.phone || "").trim();
  const images = normalizeImageList(event.images, 3);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("\u7f3a\u5c11\u6709\u6548\u5750\u6807\uff0c\u65e0\u6cd5\u65b0\u589e\u5e97\u94fa");
  }
  if (!name) {
    throw new Error("\u5e97\u94fa\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a");
  }
  if (!address) {
    throw new Error("\u5e97\u94fa\u5730\u5740\u4e0d\u80fd\u4e3a\u7a7a");
  }
  if (images.length < 1) {
    throw new Error("\u5e97\u94fa\u81f3\u5c11\u9700\u8981 1 \u5f20\u56fe\u7247");
  }

  const sourceId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const data = {
    sourceId,
    name,
    category: category || "\u5176\u4ed6",
    tags,
    placeType: placeType || "\u5e97\u94fa",
    address,
    phone,
    images,
    avgRating: 0,
    avgPrice: 0,
    checkinCount: 0,
    distance: 0,
    latitude,
    longitude,
    location: new db.Geo.Point(longitude, latitude),
    source: "user",
    custom: true,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };

  const res = await db.collection("shops").add({ data });
  const saved = { ...data, _id: res._id };

  return {
    message: "\u5e97\u94fa\u5df2\u521b\u5efa",
    shop: shapeShopForClient(saved, latitude, longitude),
  };
}

async function getEditorPermission(event) {
  const shopId = normalizeText(event.shopId);
  if (!shopId) {
    throw new Error("shopId \u4e0d\u80fd\u4e3a\u7a7a");
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || "";
  return {
    shopId,
    canEdit: isAdmin(openid),
    isAdmin: isAdmin(openid),
  };
}

async function updateShop(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || "";
  if (!isAdmin(openid)) {
    throw new Error("\u65e0\u6743\u9650\u7f16\u8f91\u5e97\u94fa");
  }

  const shopId = normalizeText(event.shopId);
  const name = normalizeText(event.name);
  const tags = Array.isArray(event.tags)
    ? event.tags.map((tag) => normalizeText(tag)).filter(Boolean)
    : [];
  const category = normalizeText(event.category || tags[0] || "\u5176\u4ed6");
  const placeType = normalizeText(event.placeType || "\u5e97\u94fa");
  const address = normalizeText(event.address);
  const phone = normalizeText(event.phone);
  const images = normalizeImageList(event.images, 3);
  const latitude = toNumber(event.latitude, NaN);
  const longitude = toNumber(event.longitude, NaN);

  if (!shopId) {
    throw new Error("shopId \u4e0d\u80fd\u4e3a\u7a7a");
  }
  if (!name) {
    throw new Error("\u5e97\u94fa\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a");
  }
  if (!address) {
    throw new Error("\u5e97\u94fa\u5730\u5740\u4e0d\u80fd\u4e3a\u7a7a");
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("\u7f3a\u5c11\u6709\u6548\u5750\u6807");
  }
  if (images.length < 1) {
    throw new Error("\u5e97\u94fa\u81f3\u5c11\u9700\u8981 1 \u5f20\u56fe\u7247");
  }

  const currentRes = await db.collection("shops").doc(shopId).get();
  const current = currentRes.data || null;
  if (!current) {
    throw new Error("\u5e97\u94fa\u4e0d\u5b58\u5728");
  }

  const data = {
    name,
    category: category || "\u5176\u4ed6",
    tags,
    placeType: placeType || "\u5e97\u94fa",
    address,
    phone,
    images,
    latitude,
    longitude,
    location: new db.Geo.Point(longitude, latitude),
    updatedAt: db.serverDate(),
  };

  await db.collection("shops").doc(shopId).update({ data });
  const latestRes = await db.collection("shops").doc(shopId).get();
  const latest = latestRes.data || { ...current, ...data, _id: shopId };

  return {
    message: "\u5e97\u94fa\u4fe1\u606f\u5df2\u66f4\u65b0",
    shop: shapeShopForClient(latest, latitude, longitude),
  };
}

async function reverseGeocode(event) {
  const latitude = toNumber(event.latitude, NaN);
  const longitude = toNumber(event.longitude, NaN);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("\u7f3a\u5c11\u6709\u6548\u5750\u6807");
  }
  if (!mapKey || !mapSk) {
    throw new Error("\u672a\u914d\u7f6e\u817e\u8baf\u5730\u56fe Key/SK");
  }

  const path = "/ws/geocoder/v1/";
  const signed = buildSignedQuery(path, {
    key: mapKey,
    location: `${latitude},${longitude}`,
  });
  const url = `https://apis.map.qq.com${path}?${signed}`;
  const response = await requestJson(url);

  if (response.status !== 0) {
    throw new Error(response.message || "\u53cd\u5730\u7406\u7f16\u7801\u5931\u8d25");
  }

  const result = response.result || {};
  return {
    address: result.address || "",
    adInfo: result.ad_info || {},
    addressComponent: result.address_component || {},
  };
}

exports.main = async (event) => {
  switch (event.action) {
    case "search":
      return searchShops(event);
    case "createCustom":
      return createCustomShop(event);
    case "updateShop":
      return updateShop(event);
    case "getEditorPermission":
      return getEditorPermission(event);
    case "reverseGeocode":
      return reverseGeocode(event);
    default:
      throw new Error(`\u4e0d\u652f\u6301\u7684 action: ${event.action}`);
  }
};
