var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-GQkydr/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// index.ts
var BGG_API = "https://boardgamegeek.com/xmlapi2";
function getAttr(xml, attr) {
  const match = xml.match(new RegExp(`${attr}="([^"]*)"`));
  return match ? match[1] : "";
}
__name(getAttr, "getAttr");
function getTagContent(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : "";
}
__name(getTagContent, "getTagContent");
function decodeXmlEntities(text) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}
__name(decodeXmlEntities, "decodeXmlEntities");
function convertBbCode(text) {
  return text.replace(
    /\[thing=(\d+)\](.*?)\[\/thing\]/g,
    '<a href="https://boardgamegeek.com/boardgame/$1" target="_blank" rel="noopener noreferrer">$2</a>'
  ).replace(
    /\[user=([^\]]+)\](.*?)\[\/user\]/g,
    '<a href="https://boardgamegeek.com/user/$1" target="_blank" rel="noopener noreferrer">$2</a>'
  ).replace(
    /\[url=([^\]]+)\](.*?)\[\/url\]/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>'
  ).replace(/\[b\](.*?)\[\/b\]/g, "<strong>$1</strong>").replace(/\[i\](.*?)\[\/i\]/g, "<em>$1</em>").replace(/\[u\](.*?)\[\/u\]/g, "<u>$1</u>").replace(/\n/g, "<br>");
}
__name(convertBbCode, "convertBbCode");
async function fetchPlays(username, apiToken) {
  const response = await fetch(`${BGG_API}/plays?username=${encodeURIComponent(username)}&page=1`, {
    headers: {
      "User-Agent": "DaveSniderActivityFeed/1.0 (personal activity tracker; contact@davesnider.com)",
      Authorization: `Bearer ${apiToken}`
    }
  });
  if (!response.ok) {
    throw new Error(`BGG API error: ${response.status}`);
  }
  const xml = await response.text();
  const plays = [];
  const playMatches = xml.matchAll(/<play\s+([^>]+)>([\s\S]*?)<\/play>/g);
  for (const match of playMatches) {
    const playAttrs = match[1];
    const playContent = match[2];
    const id = getAttr(playAttrs, "id");
    const date = getAttr(playAttrs, "date");
    const location = decodeXmlEntities(getAttr(playAttrs, "location"));
    const incomplete = getAttr(playAttrs, "incomplete") === "1";
    const itemMatch = playContent.match(/<item\s+([^>]+)/);
    const itemAttrs = itemMatch ? itemMatch[1] : "";
    const gameName = decodeXmlEntities(getAttr(itemAttrs, "name"));
    const gameId = parseInt(getAttr(itemAttrs, "objectid"), 10);
    const playerMatches = playContent.match(/<player\s/g);
    const numPlayers = playerMatches ? playerMatches.length : 0;
    const rawComments = decodeXmlEntities(getTagContent(playContent, "comments"));
    const comments = rawComments ? convertBbCode(rawComments) : "";
    if (id && date && gameName && gameId) {
      plays.push({
        id,
        date,
        location,
        incomplete,
        gameName,
        gameId,
        numPlayers,
        comments
      });
    }
  }
  return plays;
}
__name(fetchPlays, "fetchPlays");
async function fetchGameThumbnails(gameIds, apiToken) {
  const thumbnails = /* @__PURE__ */ new Map();
  if (gameIds.length === 0) return thumbnails;
  const batchSize = 20;
  for (let i = 0; i < gameIds.length; i += batchSize) {
    const batch = gameIds.slice(i, i + batchSize);
    const ids = batch.join(",");
    const response = await fetch(`${BGG_API}/thing?id=${ids}&type=boardgame`, {
      headers: {
        "User-Agent": "DaveSniderActivityFeed/1.0 (personal activity tracker; contact@davesnider.com)",
        Authorization: `Bearer ${apiToken}`
      }
    });
    if (response.ok) {
      const xml = await response.text();
      const itemMatches = xml.matchAll(/<item[^>]+id="(\d+)"[^>]*>[\s\S]*?<thumbnail>([^<]+)<\/thumbnail>/g);
      for (const match of itemMatches) {
        const id = parseInt(match[1], 10);
        const thumb = match[2].trim();
        thumbnails.set(id, thumb);
      }
    }
    if (i + batchSize < gameIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return thumbnails;
}
__name(fetchGameThumbnails, "fetchGameThumbnails");
function parsePlayDate(dateStr) {
  const date = /* @__PURE__ */ new Date(dateStr + "T12:00:00Z");
  return Math.floor(date.getTime() / 1e3);
}
__name(parsePlayDate, "parsePlayDate");
async function processPlays(env) {
  console.log(`Fetching BGG plays for: ${env.BGG_USERNAME}`);
  const plays = await fetchPlays(env.BGG_USERNAME, env.BGG_API_TOKEN);
  console.log(`Found ${plays.length} plays`);
  const uniqueGameIds = [...new Set(plays.map((p) => p.gameId))];
  const thumbnails = await fetchGameThumbnails(uniqueGameIds, env.BGG_API_TOKEN);
  const items = plays.map((play) => ({
    externalId: play.id,
    timestamp: parsePlayDate(play.date),
    title: `Played ${play.gameName}`,
    url: `https://boardgamegeek.com/boardgame/${play.gameId}`,
    thumbnailUrl: thumbnails.get(play.gameId),
    gameId: play.gameId,
    playDate: play.date,
    location: play.location || void 0,
    numPlayers: play.numPlayers || void 0,
    comments: play.comments || void 0,
    incomplete: play.incomplete
  }));
  return { items, errors: [] };
}
__name(processPlays, "processPlays");
var index_default = {
  async scheduled(event, env, ctx) {
    console.log("BGG activity worker triggered");
    try {
      const { items, errors } = await processPlays(env);
      if (errors.length > 0) {
        console.warn("Some items failed:", errors);
      }
      const response = await fetch(env.INGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.ACTIVITY_INGEST_TOKEN}`
        },
        body: JSON.stringify({ items, deletedIds: [] })
      });
      if (!response.ok) {
        throw new Error(`Ingest failed: ${response.status} ${await response.text()}`);
      }
      const result = await response.json();
      console.log("BGG ingest result:", result);
    } catch (error) {
      console.error("BGG worker error:", error);
      throw error;
    }
  },
  async fetch(request, env) {
    if (request.method === "POST") {
      try {
        const { items, errors } = await processPlays(env);
        const response = await fetch(env.INGEST_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.ACTIVITY_INGEST_TOKEN}`
          },
          body: JSON.stringify({ items, deletedIds: [] })
        });
        if (!response.ok) {
          const text = await response.text();
          return new Response(JSON.stringify({ error: `Ingest failed: ${response.status}`, details: text }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
        const result = await response.json();
        return new Response(JSON.stringify({ ...result, processingErrors: errors }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    return new Response("Method not allowed", { status: 405 });
  }
};

// ../../node_modules/.pnpm/wrangler@4.98.0/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/.pnpm/wrangler@4.98.0/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-GQkydr/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = index_default;

// ../../node_modules/.pnpm/wrangler@4.98.0/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-GQkydr/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
