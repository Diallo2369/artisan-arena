// Comportements communs à toutes les pages : le bouton « Autour de ma position ».
// Les pages sont déjà complètes en HTML ; la recherche et la fiche ont leur propre script (search.js, fiche-page.js).
document.querySelectorAll("[data-geo]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const label = btn.textContent;
    if (!navigator.geolocation) { btn.textContent = "Position indisponible sur cet appareil"; return; }
    btn.disabled = true; btn.textContent = "Recherche de votre position…";
    navigator.geolocation.getCurrentPosition((pos) => {
      const q = btn.closest("form")?.querySelector("input[name=q]")?.value.trim() || "";
      location.href = "/recherche/?" + new URLSearchParams({ q, lat: pos.coords.latitude.toFixed(4), lon: pos.coords.longitude.toFixed(4) });
    }, () => { btn.disabled = false; btn.textContent = "Position refusée : tapez une ville"; setTimeout(() => (btn.textContent = label), 4000); }, { timeout: 10000 });
  });
});
