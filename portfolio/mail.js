/* Correo de la casa, a prueba de cosecha de direcciones: el fuente no
   contiene la direccion; se ensambla en el navegador al cuarto toque. */
(function () {
  var codes = [97, 108, 102, 114, 101, 100, 45, 112, 105, 64, 54, 56, 54, 102, 54, 99, 54, 49, 46, 100, 101, 118];
  var NEEDED = 4;

  function reveal(btn) {
    var addr = String.fromCharCode.apply(null, codes)
    var a = document.createElement("a")
    a.href = "mai" + "lto:" + addr
    a.textContent = addr
    a.style.color = "var(--green)"
    btn.replaceWith(a)
  }

  document.querySelectorAll(".mail-btn").forEach(function (btn) {
    var taps = 0
    var en = document.documentElement.lang === "en"
    var label = en ? "Write us" : "Escr\u00edbenos"
    btn.addEventListener("click", function () {
      taps += 1
      if (taps < NEEDED) {
        btn.textContent = label + " \u00b7 " + taps + "/" + NEEDED
        return
      }
      reveal(btn)
    })
  })
})()
