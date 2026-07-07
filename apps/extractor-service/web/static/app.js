// Frontend del flujo ÚNICO: subes videos largos → la app recorta los mejores
// momentos y los edita (subtítulos, animaciones, CTA) en una sola pasada.
// Música de fondo y sonido de inicio son opcionales (checkboxes).
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const fileInput = $("file");
  const dropzone = $("dropzone");
  const filenameEl = $("filename");
  const submitBtn = $("submit-btn");
  const form = $("upload-form");

  const uploadCard = $("upload-card");
  const progressCard = $("progress-card");
  const resultCard = $("result-card");
  const errorCard = $("error-card");

  const statusLabel = $("status-label");
  const progressFill = $("progress-fill");
  const progressMsg = $("progress-msg");
  const avisoEl = $("aviso");

  const clipsGrid = $("clips-grid");
  const downloadAll = $("download-all");

  let pollTimer = null;

  const STATUS_TEXT = {
    queued: "En cola…",
    extracting: "Extrayendo audio…",
    transcribing: "Transcribiendo…",
    analyzing: "Analizando (IA)…",
    rendering: "Recortando y editando…",
    done: "¡Listo!",
    error: "Error",
  };

  function show(card) {
    [uploadCard, progressCard, resultCard, errorCard].forEach((c) =>
      c.classList.add("hidden")
    );
    card.classList.remove("hidden");
  }

  function describeSelection(files) {
    if (!files || !files.length) return "";
    if (files.length === 1) return files[0].name;
    return `${files.length} videos seleccionados`;
  }

  fileInput.addEventListener("change", () => {
    filenameEl.textContent = describeSelection(fileInput.files);
    submitBtn.disabled = !fileInput.files.length;
  });

  ["dragover", "dragenter"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      filenameEl.textContent = describeSelection(fileInput.files);
      submitBtn.disabled = false;
    }
  });

  // Checkboxes de opciones: muestran/ocultan sus campos.
  $("con_musica").addEventListener("change", () => {
    $("musica-extra").style.display = $("con_musica").checked ? "block" : "none";
  });
  $("con_intro").addEventListener("change", () => {
    $("intro-extra").style.display = $("con_intro").checked ? "block" : "none";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const files = fileInput.files;
    if (!files.length) return;

    const data = new FormData();
    for (const f of files) data.append("files", f);
    data.append("mode", "full");
    data.append("num_clips", $("num_clips").value || "5");

    // Música de fondo: opcional. Sin la casilla, el anuncio va sin música.
    const conMusica = $("con_musica").checked;
    data.append("use_music", conMusica ? "1" : "0");
    if (conMusica) {
      for (const m of $("music").files) data.append("music", m);
    }

    // Sonido de inicio: opcional (con archivo propio o el whoosh por defecto).
    const conIntro = $("con_intro").checked;
    data.append("use_intro", conIntro ? "1" : "0");
    if (conIntro) {
      const intro = $("intro").files[0];
      if (intro) data.append("intro", intro);
    }

    show(progressCard);
    setProgress("queued", 2, "Subiendo videos…");

    try {
      const res = await fetch("/api/jobs", { method: "POST", body: data });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }
      const { job_id } = await res.json();
      poll(job_id);
    } catch (err) {
      showError(err.message);
    }
  });

  function setProgress(status, pct, msg) {
    statusLabel.textContent = STATUS_TEXT[status] || "Procesando…";
    progressFill.style.width = `${pct}%`;
    progressMsg.textContent = msg || "";
  }

  // Tolera cortes de red/luz: no se rinde al primer fallo. Mientras tanto, el
  // trabajo sigue en el servidor (persistido en SQLite) y se reanuda al volver.
  const MAX_POLL_FAILS = 90; // ~3 min de cortes tolerados (intervalo 2s)
  let pollFails = 0;

  function poll(jobId) {
    clearInterval(pollTimer);
    localStorage.setItem("clipgen_job", jobId); // para reanudar tras recargar
    pollFails = 0;
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (res.status === 404) {
          // El servidor responde pero no conoce el trabajo: no insistir.
          clearInterval(pollTimer);
          localStorage.removeItem("clipgen_job");
          showError("No se encontró el trabajo. Vuelve a empezar.");
          return;
        }
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const job = await res.json();
        pollFails = 0;
        setProgress(job.status, job.progress, job.message);

        if (job.status === "done") {
          clearInterval(pollTimer);
          localStorage.removeItem("clipgen_job");
          finish(jobId, job);
        } else if (job.status === "error") {
          clearInterval(pollTimer);
          localStorage.removeItem("clipgen_job");
          showError(job.error || "Error en el procesamiento");
        }
      } catch (err) {
        // Fallo de red (corte de luz/internet): reintentar sin rendirse.
        pollFails++;
        if (pollFails >= MAX_POLL_FAILS) {
          clearInterval(pollTimer);
          showError(
            "Se perdió la conexión y no volvió. Tu trabajo sigue en el servidor: " +
            "recarga esta página para reanudarlo."
          );
        } else {
          statusLabel.textContent = "Reconectando…";
          progressMsg.textContent =
            `Conexión interrumpida, reintentando… (${pollFails})`;
        }
      }
    }, 2000);
  }

  function clipCell(url, label) {
    const cell = document.createElement("div");
    cell.className = "clip-cell";
    const v = document.createElement("video");
    v.src = url; v.controls = true; v.playsInline = true;
    const a = document.createElement("a");
    a.href = url; a.className = "clip-dl"; a.textContent = label;
    cell.append(v, a);
    return cell;
  }

  function finish(jobId, job) {
    clipsGrid.innerHTML = "";
    const old = document.getElementById("project-link");
    if (old) old.remove();

    const clips = job.clips || [];
    const isAd = job.mode === "ad" || job.mode === "full";

    if (clips.length) {
      // Hay video(s) terminado(s): previsualiza y descarga.
      clips.forEach((url, i) =>
        clipsGrid.append(clipCell(url, `⬇️ ${isAd ? "Anuncio" : "Clip"} ${i + 1}`))
      );
      $("result-title").textContent =
        `✅ ${clips.length} ${isAd ? "anuncio(s)" : "clips"} listo(s)`;
      downloadAll.textContent = "⬇️ Descargar todos (.zip)";
      downloadAll.href = job.download_url;
    } else if (isAd) {
      // Aún sin render -> a previsualizar en vivo.
      $("result-title").textContent = "🎬 Anuncios listos para previsualizar";
      const info = document.createElement("p");
      info.className = "ad-note";
      info.innerHTML =
        "Mira tus anuncios <b>en vivo</b> (sin esperar el render) y, si te gustan, " +
        "renderiza el video final desde ahí.";
      clipsGrid.appendChild(info);
      downloadAll.textContent = "👁️ Previsualizar y renderizar";
      downloadAll.href = job.preview_url || job.download_url;
    }

    // Ofrecemos también el proyecto editable.
    if (isAd && job.project_url) {
      const pl = document.createElement("a");
      pl.id = "project-link";
      pl.className = "download-btn";
      pl.style.background = "transparent";
      pl.style.border = "1px solid #39404d";
      pl.href = job.project_url;
      pl.textContent = "🛠️ Descargar proyecto Remotion editable (.zip)";
      downloadAll.insertAdjacentElement("afterend", pl);
    }

    if (job.aviso) {
      avisoEl.textContent = job.aviso;
      avisoEl.classList.remove("hidden");
    }
    show(resultCard);
  }

  function showError(msg) {
    $("error-msg").textContent = msg || "Error desconocido";
    show(errorCard);
  }

  $("new-btn").addEventListener("click", reset);
  $("retry-btn").addEventListener("click", reset);

  function reset() {
    clearInterval(pollTimer);
    localStorage.removeItem("clipgen_job");
    form.reset();
    filenameEl.textContent = "";
    submitBtn.disabled = true;
    avisoEl.classList.add("hidden");
    clipsGrid.innerHTML = "";
    $("musica-extra").style.display = "none";
    $("intro-extra").style.display = "none";
    show(uploadCard);
  }

  // Al cargar la página: si había un trabajo en curso (p.ej. se cortó la luz),
  // reanuda el seguimiento automáticamente.
  const pending = localStorage.getItem("clipgen_job");
  if (pending) {
    show(progressCard);
    setProgress("queued", 2, "Reanudando trabajo anterior…");
    poll(pending);
  }
})();
