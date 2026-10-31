import { verifyProof } from "./proof-verifier.js";
import { shareCopy, shareLanguage } from "./share-copy.js";
import {
  describeRoundShare,
  defaultShareRound,
  roundSharePath,
  validShareRound,
  validShareGame,
} from "./round-share-model.js";

const $ = (id) => document.getElementById(id);
const initial = new URL(location.href).searchParams;
let language = shareLanguage(
  initial.get("lang") || document.documentElement.lang,
);
let roundId = initial.get("round"),
  gameId = initial.get("game"),
  data = null,
  verification = null,
  model = null;
let generation = 0,
  offset = 0,
  busy = false;
const words = () => shareCopy[language];
const now = () => Date.now() + offset;
const validRequest = () =>
  (roundId === null || validShareRound(roundId)) &&
  (gameId === null || validShareGame(gameId));
function text(id, value) {
  $(id).textContent = value;
}
function translate() {
  document.documentElement.lang = language;
  $("shareLanguage").value = language;
  try {
    localStorage.setItem("market-luck-language", language);
  } catch {}
  for (const element of document.querySelectorAll("[data-copy]"))
    element.textContent = words()[element.dataset.copy];
  document.title = "Market Luck · " + words().title;
  for (const key of ["description", "og:description"]) {
    const meta = document.querySelector(
      `meta[${key.startsWith("og:") ? "property" : "name"}="${key}"]`,
    );
    if (meta) meta.content = words().subtitle + ". " + words().money;
  }
}
function disableActions() {
  for (const id of ["nativeShare", "copyShare", "saveShare"])
    $(id).disabled = true;
  $("shareUrl").value = "";
}
function render() {
  translate();
  model = data
    ? describeRoundShare(data, gameId, language, now(), verification)
    : null;
  if (!model) {
    $("roundCard").hidden = true;
    disableActions();
    return;
  }
  $("roundCard").hidden = false;
  $("shareLoad").hidden = true;
  gameId = model.game.id;
  const signature = JSON.stringify([language, model.options]);
  if ($("shareGame").dataset.signature !== signature) {
    $("shareGame").replaceChildren(
      ...model.options.map((game) => {
        const option = document.createElement("option");
        option.value = game.id;
        option.textContent = `${game.flag} ${game.name}`;
        return option;
      }),
    );
    $("shareGame").dataset.signature = signature;
  }
  $("shareGame").value = gameId;
  text("roundCardTitle", model.game.name);
  text("shareFormat", model.game.summary);
  text("shareMode", model.modeLabel);
  $("shareMode").dataset.mode = model.mode;
  text("sharePhase", model.phaseLabel);
  $("sharePhase").dataset.phase = model.phase;
  text("shareMessage", model.message);
  $("shareSimulation").hidden = model.mode === "LIVE";
  $("shareAdvanced").hidden = !model.advancedSimulation;
  text("shareCutoff", model.cutoff);
  text("shareReady", model.ready);
  text("shareSources", model.sources || words().unavailable);
  text("shareRoundId", model.id);
  $("shareNumbers").replaceChildren();
  $("shareNumbers").setAttribute(
    "aria-label",
    model.game.name + " · " + words().main,
  );
  for (const [value, special] of [
    ...model.main.map((n) => [n, false]),
    ...(model.bonus !== null ? [[model.bonus, true]] : []),
  ]) {
    const ball = document.createElement("span");
    ball.className = "ball" + (special ? " bonus" : "");
    ball.textContent = String(value).padStart(2, "0");
    ball.setAttribute(
      "aria-label",
      `${special ? words().bonus : words().main} ${value}`,
    );
    $("shareNumbers").append(ball);
  }
  for (const [id, hash] of [
    ["shareRules", "rules"],
    ["shareSourcesLink", "sources"],
    ["shareVerify", "results"],
  ])
    $(id).href = model.audit + "#" + hash;
  const url = new URL(model.path, location.origin);
  $("shareUrl").value = url.href;
  // Canonical links deliberately drop arbitrary tracking/account query parameters.
  history.replaceState(null, "", url.pathname + url.search);
  $("nativeShare").disabled = false;
  $("copyShare").disabled = false;
  $("saveShare").disabled = !model.canExport;
}
async function get(path) {
  const response = await fetch(path, {
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) throw Error("PUBLIC_RECORD_UNAVAILABLE");
  return response.json();
}
async function load() {
  const attempt = ++generation;
  data = null;
  verification = null;
  model = null;
  busy = true;
  disableActions();
  $("roundCard").hidden = true;
  $("shareLoad").hidden = false;
  text("shareLoad", words().loading);
  text("shareActionStatus", "");
  $("refreshShare").disabled = true;
  try {
    if (!validRequest()) throw Error("INVALID_LINK");
    let record;
    if (roundId === null) {
      const state = await get("/api/state");
      const round = defaultShareRound(state);
      if (!round) {
        text("shareLoad", words().none);
        return;
      }
      record = { round, demo: state.demo, serverTime: state.serverTime };
    } else record = await get("/api/round/" + encodeURIComponent(roundId));
    if (attempt !== generation) return;
    if (roundId !== null && record.round?.id !== roundId)
      throw Error("ROUND_MISMATCH");
    if (!describeRoundShare(record, gameId, language, record.serverTime, null))
      throw Error("INVALID_ROUND");
    data = record;
    roundId = data.round.id;
    offset = Number.isSafeInteger(data.serverTime)
      ? data.serverTime - Date.now()
      : 0;
    render();
    if (data.round.status === "settled") {
      try {
        const proof = await get("/api/proof/" + encodeURIComponent(roundId));
        if (attempt !== generation) return;
        if (JSON.stringify(proof) !== JSON.stringify(data.round.proof))
          throw Error("PROOF_COPIES_DIFFER");
        const result = await verifyProof(proof, {
          roundId,
          commitment: data.round.commitment,
          manifest: data.round.manifest,
        });
        if (attempt !== generation) return;
        verification = result;
      } catch {
        if (attempt === generation) verification = { ok: false };
      }
      if (attempt === generation) render();
    }
  } catch {
    if (attempt !== generation) return;
    data = null;
    model = null;
    $("roundCard").hidden = true;
    disableActions();
    $("shareLoad").hidden = false;
    text("shareLoad", words().error);
  } finally {
    if (attempt === generation) {
      busy = false;
      $("refreshShare").disabled = false;
    }
  }
}
async function copyLink() {
  if (!model) return;
  const value = $("shareUrl").value;
  try {
    await navigator.clipboard.writeText(value);
    text("shareActionStatus", words().copied);
  } catch {
    $("shareUrl").focus();
    $("shareUrl").select();
    text("shareActionStatus", words().manual);
  }
}
$("copyShare").onclick = copyLink;
$("nativeShare").onclick = async () => {
  if (!model) return;
  if (!navigator.share) return copyLink();
  try {
    await navigator.share({
      title: "Market Luck · " + model.modeLabel,
      text: words().title + " " + words().money,
      url: $("shareUrl").value,
    });
    text("shareActionStatus", words().shared);
  } catch (error) {
    if (error.name === "AbortError")
      text("shareActionStatus", words().cancelled);
    else await copyLink();
  }
};
$("saveShare").onclick = async () => {
  if (!model?.canExport) return;
  const snapshot = structuredClone(model),
    labels = shareCopy[snapshot.language];
  $("saveShare").disabled = true;
  try {
    await document.fonts.ready;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 2200;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("CANVAS_UNAVAILABLE");
    ctx.fillStyle = "#f4f5fb";
    ctx.fillRect(0, 0, 1080, 2200);
    ctx.fillStyle = "#fff";
    ctx.fillRect(48, 48, 984, 2104);
    ctx.fillStyle = "#5969d5";
    ctx.fillRect(48, 48, 984, 10);
    let y = 118;
    function lines(value, size = 28, color = "#505774", weight = "400") {
      ctx.font = `${weight} ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`;
      ctx.fillStyle = color;
      let line = "";
      for (const char of String(value)) {
        if (ctx.measureText(line + char).width > 880) {
          ctx.fillText(line, 96, y);
          y += size * 1.5;
          line = char;
        } else line += char;
      }
      if (line) {
        ctx.fillText(line, 96, y);
        y += size * 1.5;
      }
    }
    lines("MARKET LUCK", 26, "#35418c", "800");
    y += 22;
    lines(
      snapshot.modeLabel,
      26,
      snapshot.mode === "LIVE" ? "#35418c" : "#735018",
      "700",
    );
    y += 28;
    if (snapshot.mode !== "LIVE") {
      lines(labels.simulation, 24, "#735018");
      y += 10;
    }
    lines(labels.title, 44, "#262940", "800");
    y += 20;
    lines(snapshot.game.name, 36, "#262940", "700");
    lines(snapshot.game.summary, 25);
    y += 20;
    if (snapshot.main.length) {
      const balls = [
        ...snapshot.main.map((n) => [n, false]),
        ...(snapshot.bonus !== null ? [[snapshot.bonus, true]] : []),
      ];
      balls.forEach(([n, special], i) => {
        const x = 138 + (i % 9) * 96;
        ctx.beginPath();
        ctx.arc(x, y + 28, 38, 0, Math.PI * 2);
        ctx.fillStyle = special ? "#fff0d5" : "#e9ecff";
        ctx.fill();
        ctx.fillStyle = special ? "#735018" : "#35418c";
        ctx.font = '800 32px "Segoe UI", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(String(n).padStart(2, "0"), x, y + 40);
        ctx.textAlign = "left";
        if (i % 9 === 8 || i === balls.length - 1) y += 102;
      });
    }
    lines(
      snapshot.phaseLabel,
      32,
      snapshot.phase === "passed" ? "#17664a" : "#262940",
      "700",
    );
    y += 12;
    if (snapshot.advancedSimulation)
      lines(labels.advancedSimulation, 24, "#735018");
    lines(`${labels.cutoff}: ${snapshot.cutoff}`, 27);
    lines(`${labels.ready}: ${snapshot.ready}`, 27);
    lines(labels.zone, 23);
    lines(labels.timeNote, 23);
    y += 18;
    lines(`${labels.sources}: ${snapshot.sources}`, 25);
    lines(`${labels.round}: ${snapshot.id}`, 23);
    y += 18;
    lines(labels.money, 27, "#35418c", "700");
    lines(labels.scope, 23);
    y += 20;
    lines(new URL(snapshot.path, location.origin).href, 22, "#35418c");
    const trimmed = document.createElement("canvas");
    trimmed.width = 1080;
    trimmed.height = Math.ceil(y + 65);
    if (trimmed.height > canvas.height) throw Error("CARD_TOO_TALL");
    const target = trimmed.getContext("2d");
    if (!target) throw Error("CANVAS_UNAVAILABLE");
    target.drawImage(canvas, 0, 0);
    const blob = await new Promise((resolve) =>
      trimmed.toBlob(resolve, "image/png"),
    );
    if (!blob) throw Error("NO_IMAGE");
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `market-luck-${snapshot.mode.toLowerCase()}-${snapshot.id.slice(0, 12)}-${snapshot.game.id}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    text("shareActionStatus", labels.saved);
  } catch {
    text("shareActionStatus", labels.saveFailed);
  } finally {
    $("saveShare").disabled = !model?.canExport;
  }
};
$("shareGame").onchange = () => {
  gameId = $("shareGame").value;
  text("shareActionStatus", "");
  render();
};
$("shareLanguage").onchange = () => {
  language = shareLanguage($("shareLanguage").value);
  text("shareActionStatus", "");
  translate();
  if (data) render();
  else if (!busy) load();
};
$("refreshShare").onclick = load;
setInterval(() => {
  if (data && !busy) render();
}, 30000);
translate();
load();
