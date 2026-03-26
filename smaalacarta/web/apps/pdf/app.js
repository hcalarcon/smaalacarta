const hostname = window.location.hostname;
const pathParts = window.location.pathname.split("/").filter(Boolean);

let cliente = null;

// 👉 Caso 1: subdominio (demo.smaalacarta.com)
if (hostname.startsWith("demo.")) {
  cliente = "demo";
}
// 👉 Caso 2: path (/santa-julia/pdf)
else {
  cliente = pathParts[0];
}

// 👉 vista (pdf, menu, etc)
const view = hostname.startsWith("demo.")
  ? pathParts[0] // /pdf
  : pathParts[1]; // /cliente/pdf

let pdfPath = "";

if (cliente === "demo") {
  pdfPath = "/data/demo/demomenu.pdf";
  document.title = "Menú Demo";
  document.getElementById("pdfViewer").src = pdfPath;
} else {
  const basePath = `/data/clientes/${cliente}`;

  fetch(`${basePath}/config.json`)
    .then((res) => res.json())
    .then((config) => {
      pdfPath = `${basePath}/${config.pdf.file}`;
      document.title = `Menú - ${config.name}`;
      document.getElementById("pdfViewer").src = pdfPath;
    })
    .catch(() => {
      document.body.innerHTML = "<h1>Cliente no encontrado</h1>";
    });
}
