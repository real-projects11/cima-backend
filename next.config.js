/** @type {import('next').NextConfig} */
module.exports = {
  async rewrites() {
    return [
      // Cuando alguien entra a la raíz del dominio, le mostramos el contenido
      // de public/cima.html sin cambiarle la URL en la barra del navegador.
      { source: '/', destination: '/cima.html' },
    ];
  },
};
