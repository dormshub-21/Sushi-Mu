import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Minus,
  ShoppingBag,
  CreditCard,
  Banknote,
  Smartphone,
  Printer,
  Lock,
  LogOut,
  Trash2,
  ChefHat,
  Settings,
  ArrowLeft,
  CalendarDays,
  BarChart3,
  FileText,
  ListOrdered,
  Search,
  Pencil,
  Eye,
  RefreshCw,
  Boxes,
  Tags
} from 'lucide-react';
import { apiRequest, resolveImageUrl } from './services/api';

const paymentMethods = [
  { key: 'efectivo', label: 'Efectivo', icon: Banknote },
  { key: 'transferencia', label: 'Transferencia', icon: Smartphone },
  { key: 'tarjeta', label: 'Tarjeta', icon: CreditCard }
];

const adminTabs = [
  { key: 'categoria', label: 'Crear categoría', icon: Tags },
  { key: 'producto', label: 'Crear producto', icon: Boxes },
  { key: 'historial', label: 'Historial de pedidos', icon: ListOrdered },
  { key: 'metricas', label: 'Métricas', icon: BarChart3 },
  { key: 'reportes', label: 'Reportes', icon: FileText }
];

function money(value) {
  return Number(value || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN'
  });
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function yyyyMMdd(date) {
  return date.toISOString().slice(0, 10);
}

function getPresetRange(type) {
  const now = new Date();
  const today = yyyyMMdd(now);

  if (type === 'hoy' || type === 'dia') {
    return {
      fecha_desde: today,
      fecha_hasta: today
    };
  }

  if (type === 'semanal') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);

    return {
      fecha_desde: yyyyMMdd(start),
      fecha_hasta: today
    };
  }

  if (type === 'mensual') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
      fecha_desde: yyyyMMdd(start),
      fecha_hasta: today
    };
  }

  if (type === 'anual') {
    const start = new Date(now.getFullYear(), 0, 1);

    return {
      fecha_desde: yyyyMMdd(start),
      fecha_hasta: today
    };
  }

  return {
    fecha_desde: '',
    fecha_hasta: ''
  };
}

function buildQuery(params) {
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });

  const text = query.toString();
  return text ? `?${text}` : '';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));

    reader.readAsDataURL(file);
  });
}

async function compressImageToDataUrl(file, maxSize = 900, quality = 0.82) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido.');
  }

  const originalDataUrl = await readFileAsDataUrl(file);

  const img = await new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo cargar la imagen'));

    image.src = originalDataUrl;
  });

  const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
  const width = Math.round(img.width * ratio);
  const height = Math.round(img.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          resolve(canvas.toDataURL('image/jpeg', quality));
          return;
        }

        const compressedDataUrl = await readFileAsDataUrl(blob);
        resolve(compressedDataUrl);
      },
      'image/webp',
      quality
    );
  });
}

function App() {
  const [view, setView] = useState('menu');
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [categoriaActiva, setCategoriaActiva] = useState('todas');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [carrito, setCarrito] = useState({});
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState('');

  const [payModal, setPayModal] = useState(false);
  const [ordenModal, setOrdenModal] = useState(false);
  const [ordenProcesando, setOrdenProcesando] = useState(false);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [notas, setNotas] = useState('');
  const [ticket, setTicket] = useState(null);
  const [comanda, setComanda] = useState(null);
  const [ventaParaCobrar, setVentaParaCobrar] = useState(null);

  const [token, setToken] = useState(localStorage.getItem('sushi_token') || '');
  const [loginData, setLoginData] = useState({
    username: '',
    password: ''
  });

  const [adminTab, setAdminTab] = useState('categoria');
  const [adminCategorias, setAdminCategorias] = useState([]);
  const [adminProductos, setAdminProductos] = useState([]);

  const [categoriaForm, setCategoriaForm] = useState({
    nombre: '',
    descripcion: '',
    orden: 0
  });

  const [productoForm, setProductoForm] = useState({
    id_categoria: '',
    nombre: '',
    descripcion: '',
    precio: '',
    imagen_url: ''
  });

  const [confirmacion, setConfirmacion] = useState(null);

  const [historial, setHistorial] = useState({
    ventas: [],
    pagina: 1,
    limite: 20,
    total_registros: 0,
    total_paginas: 1
  });

  const [historialFiltros, setHistorialFiltros] = useState({
    folio: '',
    fecha_desde: '',
    fecha_hasta: ''
  });

  const [detalleVenta, setDetalleVenta] = useState(null);
  const [pedidoEditando, setPedidoEditando] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [editNotas, setEditNotas] = useState('');
  const [productoNuevoEdit, setProductoNuevoEdit] = useState('');

  const [dashboardFiltros, setDashboardFiltros] = useState({
    ...getPresetRange('hoy'),
    id_producto: ''
  });

  const [dashboardData, setDashboardData] = useState(null);

  const [reporteFiltros, setReporteFiltros] = useState({
    ...getPresetRange('hoy'),
    id_producto: ''
  });

  const [reporteData, setReporteData] = useState(null);

  async function cargarMenu() {
    try {
      setLoading(true);

      const [catData, prodData] = await Promise.all([
        apiRequest('/api/categorias'),
        apiRequest('/api/productos')
      ]);

      setCategorias(catData.categorias || []);
      setProductos(prodData.productos || []);
    } catch (error) {
      setMensaje(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function cargarAdmin() {
    if (!localStorage.getItem('sushi_token')) return;

    try {
      const [catData, prodData] = await Promise.all([
        apiRequest('/api/categorias/admin/todas'),
        apiRequest('/api/productos/admin/todos')
      ]);

      setAdminCategorias(catData.categorias || []);
      setAdminProductos(prodData.productos || []);

      if (!productoForm.id_categoria && catData.categorias?.length > 0) {
        setProductoForm((prev) => ({
          ...prev,
          id_categoria: catData.categorias[0].id
        }));
      }
    } catch (error) {
      setMensaje(error.message);
    }
  }

  async function cargarHistorial(pagina = historial.pagina) {
    try {
      const query = buildQuery({
        pagina,
        limite: 20,
        folio: historialFiltros.folio,
        fecha_desde: historialFiltros.fecha_desde,
        fecha_hasta: historialFiltros.fecha_hasta
      });

      const data = await apiRequest(`/api/ventas${query}`);

      setHistorial({
        ventas: data.ventas || [],
        pagina: data.pagina || 1,
        limite: data.limite || 20,
        total_registros: data.total_registros || 0,
        total_paginas: data.total_paginas || 1
      });
    } catch (error) {
      setMensaje(error.message);
    }
  }

  async function cargarDetalleVenta(folio) {
    try {
      const data = await apiRequest(`/api/ventas/${folio}`);
      setDetalleVenta(data.venta);
    } catch (error) {
      setMensaje(error.message);
    }
  }

  async function cargarDashboard() {
    try {
      const query = buildQuery(dashboardFiltros);
      const data = await apiRequest(`/api/dashboard/ventas${query}`);
      setDashboardData(data);
    } catch (error) {
      setMensaje(error.message);
    }
  }

  async function cargarReporte() {
    try {
      const query = buildQuery(reporteFiltros);
      const data = await apiRequest(`/api/reportes/ventas${query}`);
      setReporteData(data);
    } catch (error) {
      setMensaje(error.message);
    }
  }

  useEffect(() => {
    if (token) {
      cargarMenu();
    }
  }, [token]);

  useEffect(() => {
    if (view === 'admin' && token) {
      cargarAdmin();
    }
  }, [view, token]);

  useEffect(() => {
    if (view === 'admin' && token && adminTab === 'historial') {
      cargarHistorial(1);
    }

    if (view === 'admin' && token && adminTab === 'metricas') {
      cargarDashboard();
    }

    if (view === 'admin' && token && adminTab === 'reportes') {
      cargarReporte();
    }
  }, [adminTab, view, token]);

  const productosFiltrados = useMemo(() => {
    const texto = busquedaProducto.trim().toLowerCase();

    return productos.filter((producto) => {
      const coincideCategoria =
        categoriaActiva === 'todas' ||
        String(producto.id_categoria) === String(categoriaActiva);

      const coincideBusqueda =
        !texto ||
        producto.nombre?.toLowerCase().includes(texto);

      return coincideCategoria && coincideBusqueda;
    });
  }, [productos, categoriaActiva, busquedaProducto]);

  const itemsCarrito = useMemo(() => {
    return Object.entries(carrito)
      .map(([id, cantidad]) => {
        const producto = productos.find((item) => String(item.id) === String(id));
        if (!producto || cantidad <= 0) return null;

        return {
          ...producto,
          cantidad,
          subtotal: Number(producto.precio) * cantidad
        };
      })
      .filter(Boolean);
  }, [carrito, productos]);

  const total = useMemo(() => {
    return itemsCarrito.reduce((acc, item) => acc + item.subtotal, 0);
  }, [itemsCarrito]);

  const totalItems = useMemo(() => {
    return itemsCarrito.reduce((acc, item) => acc + item.cantidad, 0);
  }, [itemsCarrito]);

  const cambioCalculado = useMemo(() => {
    if (metodoPago !== 'efectivo') return 0;
    const recibido = Number(montoRecibido || 0);
    if (recibido <= 0) return 0;
    return Math.max(recibido - total, 0);
  }, [metodoPago, montoRecibido, total]);

  function agregarProducto(productoId) {
    setCarrito((prev) => ({
      ...prev,
      [productoId]: (prev[productoId] || 0) + 1
    }));
  }

  function quitarProducto(productoId) {
    setCarrito((prev) => {
      const actual = prev[productoId] || 0;
      const nuevo = Math.max(actual - 1, 0);

      if (nuevo === 0) {
        const copia = { ...prev };
        delete copia[productoId];
        return copia;
      }

      return {
        ...prev,
        [productoId]: nuevo
      };
    });
  }

  async function generarOrden() {
    try {
      setMensaje('');

      if (itemsCarrito.length === 0) {
        setMensaje('Agrega al menos un producto.');
        return;
      }

      setOrdenProcesando(true);

      const payload = {
        notas,
        items: itemsCarrito.map((item) => ({
          producto_id: item.id,
          cantidad: item.cantidad
        }))
      };

      const data = await apiRequest('/api/ventas', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!data.ok || !data.comanda) {
        throw new Error(data.message || 'No se pudo generar la comanda.');
      }

      setComanda(data.comanda);
      setOrdenModal(false);
      setCarrito({});
      setNotas('');
      setMensaje('Orden enviada a cocina. Ahora puedes imprimir la comanda.');
    } catch (error) {
      setMensaje(error.message);
    } finally {
      setOrdenProcesando(false);
    }
  }

  async function cobrarOrden() {
    try {
      if (!ventaParaCobrar) return;

      setMensaje('');

      if (metodoPago === 'efectivo') {
        const recibido = Number(montoRecibido || 0);
        const totalCobro = Number(ventaParaCobrar.total || 0);

        if (!recibido || recibido < totalCobro) {
          setMensaje('El monto recibido debe cubrir el total de la orden.');
          return;
        }
      }

      const data = await apiRequest(`/api/ventas/${ventaParaCobrar.folio}/cobrar`, {
        method: 'PUT',
        body: JSON.stringify({
          metodo_pago: metodoPago,
          monto_recibido: metodoPago === 'efectivo' ? Number(montoRecibido) : null
        })
      });

      setTicket(data.ticket);
      setVentaParaCobrar(null);
      setDetalleVenta(null);
      setMontoRecibido('');
      setMetodoPago('efectivo');

      if (adminTab === 'historial') {
        await cargarHistorial(historial.pagina);
      }

      if (adminTab === 'metricas') {
        await cargarDashboard();
      }

      if (adminTab === 'reportes') {
        await cargarReporte();
      }
    } catch (error) {
      setMensaje(error.message);
    }
  }

  async function loginAdmin(event) {
    event.preventDefault();

    try {
      setMensaje('');

      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginData)
      });

      localStorage.setItem('sushi_token', data.token);
      setToken(data.token);
      setLoginData({ username: '', password: '' });
      setView('menu');
      setMensaje('Sesión iniciada correctamente.');
      await Promise.all([cargarAdmin(), cargarMenu()]);
    } catch (error) {
      setMensaje(error.message);
    }
  }

  function logoutAdmin() {
    localStorage.removeItem('sushi_token');
    setToken('');
    setAdminCategorias([]);
    setAdminProductos([]);
    setView('menu');
    setCarrito({});
    setTicket(null);
  }

  async function crearCategoria(event) {
    event.preventDefault();

    try {
      setMensaje('');

      await apiRequest('/api/categorias', {
        method: 'POST',
        body: JSON.stringify(categoriaForm)
      });

      setCategoriaForm({
        nombre: '',
        descripcion: '',
        orden: 0
      });

      await Promise.all([cargarAdmin(), cargarMenu()]);
      setMensaje('Categoría creada correctamente.');
    } catch (error) {
      setMensaje(error.message);
    }
  }

  async function manejarImagenProducto(file) {
    try {
      if (!file) return;

      setMensaje('Procesando imagen...');

      const imagenComprimida = await compressImageToDataUrl(file);

      setProductoForm((prev) => ({
        ...prev,
        imagen_url: imagenComprimida
      }));

      setMensaje('Imagen cargada correctamente.');
    } catch (error) {
      setMensaje(error.message);
    }
  }

  function quitarImagenProducto() {
    setProductoForm((prev) => ({
      ...prev,
      imagen_url: ''
    }));
  }

  async function crearProducto(event) {
    event.preventDefault();

    try {
      setMensaje('');

      await apiRequest('/api/productos', {
        method: 'POST',
        body: JSON.stringify({
          ...productoForm,
          precio: Number(productoForm.precio)
        })
      });

      setProductoForm((prev) => ({
        ...prev,
        nombre: '',
        descripcion: '',
        precio: '',
        imagen_url: ''
      }));

      await Promise.all([cargarAdmin(), cargarMenu()]);
      setMensaje('Producto creado correctamente.');
    } catch (error) {
      setMensaje(error.message);
    }
  }

  async function eliminarCategoria(id) {
    try {
      setMensaje('');

      await apiRequest(`/api/categorias/${id}`, {
        method: 'DELETE'
      });

      await Promise.all([cargarAdmin(), cargarMenu()]);
      setMensaje('Categoría eliminada definitivamente.');
    } catch (error) {
      setMensaje(error.message);
    }
  }

  async function eliminarProducto(id) {
    try {
      setMensaje('');

      await apiRequest(`/api/productos/${id}`, {
        method: 'DELETE'
      });

      await Promise.all([cargarAdmin(), cargarMenu()]);
      setMensaje('Producto eliminado definitivamente.');
    } catch (error) {
      setMensaje(error.message);
    }
  }

  function ticketFromVenta(venta) {
    return {
      folio: venta.folio,
      fecha: venta.creado_en,
      metodo_pago: venta.metodo_pago,
      total: Number(venta.total),
      monto_recibido: venta.monto_recibido !== null ? Number(venta.monto_recibido) : null,
      cambio: Number(venta.cambio || 0),
      notas: venta.notas || null,
      productos: (venta.detalles || []).map((item) => ({
        nombre: item.producto_nombre,
        cantidad: item.cantidad,
        precio_unitario: Number(item.precio_unitario),
        subtotal: Number(item.subtotal)
      }))
    };
  }


  function limpiarTextoTicket(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E\n]/g, '')
      .trim();
  }

  function lineTicket(left = '', right = '', width = 32) {
    const cleanLeft = limpiarTextoTicket(left);
    const cleanRight = limpiarTextoTicket(right);

    const space = width - cleanLeft.length - cleanRight.length;

    if (space <= 1) {
      return `${cleanLeft}\n${cleanRight.padStart(width, ' ')}`;
    }

    return `${cleanLeft}${' '.repeat(space)}${cleanRight}`;
  }

  function crearTextoTicketRawBT(ticketArg) {
    const width = 32;
    const separator = '-'.repeat(width);

    const lines = [];

    lines.push('           Sushi-Mu');
    lines.push('        Ticket de venta');
    lines.push(separator);
    lines.push(lineTicket('Folio:', ticketArg.folio, width));
    lines.push(lineTicket('Fecha:', formatDate(ticketArg.fecha), width));
    lines.push(lineTicket('Pago:', ticketArg.metodo_pago, width));
    lines.push(separator);

    const ESC = '\x1B';
    const GS = '\x1D';
    const BOLD_ON = `${ESC}E\x01`;
    const BOLD_OFF = `${ESC}E\x00`;
    const BIG_ON = `${GS}!\x10`;      // Doble altura, mismo ancho
    const BIG_OFF = `${GS}!\x00`;

    ticketArg.productos.forEach((item) => {
      const nombre = limpiarTextoTicket(item.nombre);

      lines.push(`${BOLD_ON}${BIG_ON}${item.cantidad} x ${nombre}${BIG_OFF}${BOLD_OFF}`);

      if (item.precio_unitario !== undefined) {
        lines.push(`${BOLD_ON}${lineTicket(`  ${money(item.precio_unitario)} c/u`, money(item.subtotal), width)}${BOLD_OFF}`);
      } else {
        lines.push(`${BOLD_ON}${lineTicket('', money(item.subtotal), width)}${BOLD_OFF}`);
      }
    });

    if (ticketArg.notas) {
      lines.push(separator);
      lines.push(`Notas: ${limpiarTextoTicket(ticketArg.notas)}`);
    }

    lines.push(separator);
    lines.push(lineTicket('TOTAL', money(ticketArg.total), width));

    if (ticketArg.monto_recibido !== null) {
      lines.push(lineTicket('Recibido', money(ticketArg.monto_recibido), width));
      lines.push(lineTicket('Cambio', money(ticketArg.cambio), width));
    }

    lines.push(separator);
    lines.push('    Gracias por su compra');
    lines.push('');
    lines.push('');
    lines.push('');

    return lines.join('\n');
  }

  function textoABase64(texto) {
    const utf8Bytes = new TextEncoder().encode(texto);
    let binary = '';

    utf8Bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });

    return btoa(binary);
  }

  async function copiarTicketTexto(ticketArg = ticket) {
    if (!ticketArg) return;

    const texto = crearTextoTicketRawBT(ticketArg);

    try {
      await navigator.clipboard.writeText(texto);
      setMensaje('Ticket copiado. Puedes pegarlo en tu editor de texto y mandarlo a RawBT.');
    } catch (error) {
      setMensaje('No se pudo copiar automáticamente. Mantén presionado el texto del ticket para copiarlo.');
    }
  }

  function imprimirTicketRawBT(ticketArg = ticket) {
    if (!ticketArg) return;

    const texto = crearTextoTicketRawBT(ticketArg);
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isAndroid) {
      const base64 = textoABase64(texto);
      const rawbtUrl = `rawbt:base64,${base64}`;

      window.location.href = rawbtUrl;
      return;
    }

    imprimirTicket(ticketArg);
  }



  function crearTextoComandaRawBT(comandaArg) {
    const width = 32;
    const separator = '-'.repeat(width);
    const lines = [];

    lines.push('           Sushi-Mu');
    lines.push('        COMANDA COCINA');
    lines.push(separator);
    lines.push(lineTicket('Orden:', comandaArg.folio, width));
    lines.push(lineTicket('Fecha:', formatDate(comandaArg.fecha), width));
    lines.push(separator);

    const ESC = '\x1B';
    const GS = '\x1D';
    const BOLD_ON = `${ESC}E\x01`;
    const BOLD_OFF = `${ESC}E\x00`;
    const BIG_ON = `${GS}!\x10`;      // Doble altura, mismo ancho
    const BIG_OFF = `${GS}!\x00`;

    comandaArg.productos.forEach((item) => {
      lines.push(`${BOLD_ON}${BIG_ON}${item.cantidad} x ${limpiarTextoTicket(item.nombre)}${BIG_OFF}${BOLD_OFF}`);
    });

    if (comandaArg.notas) {
      lines.push(separator);
      lines.push(`Notas: ${limpiarTextoTicket(comandaArg.notas)}`);
    }

    lines.push(separator);
    lines.push('Preparar pedido');
    lines.push('');
    lines.push('');
    lines.push('');

    return lines.join('\n');
  }

  function imprimirComandaRawBT(comandaArg = comanda) {
    if (!comandaArg) return;

    const texto = crearTextoComandaRawBT(comandaArg);
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isAndroid) {
      const base64 = textoABase64(texto);
      window.location.href = `rawbt:base64,${base64}`;
      return;
    }

    const html = `
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Comanda ${comandaArg.folio}</title>
        <style>
          @page { size: 58mm auto; margin: 2mm; }
          body {
            margin: 0;
            background: #fff;
            color: #000;
            font-family: "Courier New", monospace;
            font-size: 12px;
          }
          .ticket { width: 52mm; margin: 0 auto; }
          .center { text-align: center; }
          h1 { margin: 0; font-size: 18px; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          .item {
            margin: 8px 0;
            font-weight: 900;
            font-size: 16px;
          }
        </style>
      </head>
      <body>
        <main class="ticket">
          <section class="center">
            <h1>Sushi-Mu</h1>
            <p>COMANDA COCINA</p>
          </section>
          <div class="line"></div>
          <p>Orden: ${comandaArg.folio}</p>
          <p>Fecha: ${formatDate(comandaArg.fecha)}</p>
          <div class="line"></div>
          ${comandaArg.productos.map((item) => `<p class="item">${item.cantidad} x ${item.nombre}</p>`).join('')}
          ${comandaArg.notas ? `<div class="line"></div><p>Notas: ${comandaArg.notas}</p>` : ''}
          <div class="line"></div>
        </main>
        <script>
          window.addEventListener('load', () => setTimeout(() => window.print(), 250));
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=420,height=650');

    if (!printWindow) {
      setMensaje('El navegador bloqueó la ventana de impresión.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }


  function imprimirTicket(ticketArg = ticket) {
    if (!ticketArg) return;

    const escapeHtml = (value) => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

    const productosHtml = ticketArg.productos.map((item) => `
      <tr>
        <td>${escapeHtml(item.cantidad)} x ${escapeHtml(item.nombre)}</td>
        <td class="right">${money(item.subtotal)}</td>
      </tr>
    `).join('');

    const efectivoHtml = ticketArg.monto_recibido !== null ? `
      <div class="row soft"><span>Recibido</span><strong>${money(ticketArg.monto_recibido)}</strong></div>
      <div class="row soft"><span>Cambio</span><strong>${money(ticketArg.cambio)}</strong></div>
    ` : '';

    const notasHtml = ticketArg.notas ? `
      <div class="notes">Notas: ${escapeHtml(ticketArg.notas)}</div>
    ` : '';

    const html = `
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Ticket ${escapeHtml(ticketArg.folio)}</title>
        <style>
          @page { size: 58mm auto; margin: 2mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #fff;
            color: #000;
            font-family: "Courier New", monospace;
            font-size: 12px;
          }
          .ticket { width: 52mm; margin: 0 auto; }
          .center { text-align: center; }
          h1 { margin: 0; font-size: 18px; letter-spacing: 0.5px; }
          p { margin: 2px 0; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          .meta { display: grid; gap: 3px; }
          .row { display: flex; justify-content: space-between; gap: 8px; }
          table { width: 100%; border-collapse: collapse; }
          td {
            padding: 5px 0;
            vertical-align: top;
            font-size: 15px;
            font-weight: 900;
          }
          .right { text-align: right; white-space: nowrap; }
          .total { font-size: 15px; font-weight: 900; }
          .soft { color: #333; }
          .notes { border: 1px dashed #000; padding: 5px; margin-top: 7px; }
          .thanks { margin-top: 10px; text-align: center; font-weight: 900; }
        </style>
      </head>
      <body>
        <main class="ticket">
          <section class="center">
            <h1>Sushi-Mu</h1>
            <p>Ticket de venta</p>
          </section>

          <div class="line"></div>

          <section class="meta">
            <div class="row"><span>Folio:</span><strong>${escapeHtml(ticketArg.folio)}</strong></div>
            <div class="row"><span>Fecha:</span><strong>${escapeHtml(formatDate(ticketArg.fecha))}</strong></div>
            <div class="row"><span>Pago:</span><strong>${escapeHtml(ticketArg.metodo_pago)}</strong></div>
          </section>

          <div class="line"></div>

          <table>
            <tbody>${productosHtml}</tbody>
          </table>

          ${notasHtml}

          <div class="line"></div>

          <div class="row total"><span>Total</span><strong>${money(ticketArg.total)}</strong></div>
          ${efectivoHtml}

          <p class="thanks">Gracias por su compra 🍣</p>
        </main>

        <script>
          window.addEventListener('load', () => {
            setTimeout(() => window.print(), 250);
          });

          window.addEventListener('afterprint', () => {
            window.close();
          });
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=420,height=650');

    if (!printWindow) {
      setMensaje('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para imprimir.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }

  function imprimirReporte() {
    if (!reporteData) return;

    const rowsHtml = reporteData.filas.map((fila) => `
      <tr>
        <td>${fila.folio}</td>
        <td>${formatDate(fila.creado_en)}</td>
        <td class="right">${money(fila.total)}</td>
      </tr>
    `).join('');

    const producto = adminProductos.find((item) => String(item.id) === String(reporteFiltros.id_producto));

    const html = `
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Reporte de ventas</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #111;
            margin: 28px;
          }

          h1 {
            margin-bottom: 4px;
          }

          .muted {
            color: #555;
            margin-top: 0;
          }

          .filters {
            border: 1px solid #ddd;
            padding: 12px;
            border-radius: 10px;
            margin: 18px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th,
          td {
            border-bottom: 1px solid #ddd;
            padding: 9px;
            text-align: left;
          }

          th {
            background: #f5f5f5;
          }

          .right {
            text-align: right;
          }

          .total {
            margin-top: 18px;
            text-align: right;
            font-size: 1.25rem;
            font-weight: 900;
          }

          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Sushi-Mu</h1>
        <p class="muted">Reporte de ventas</p>

        <section class="filters">
          <strong>Filtros</strong><br />
          Desde: ${reporteFiltros.fecha_desde || 'Sin fecha'}<br />
          Hasta: ${reporteFiltros.fecha_hasta || 'Sin fecha'}<br />
          Producto: ${producto ? producto.nombre : 'Todos'}
        </section>

        <table>
          <thead>
            <tr>
              <th>Número de orden</th>
              <th>Fecha</th>
              <th class="right">Precio</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="total">
          Total vendido: ${money(reporteData.total)}
        </div>

        <script>
          window.addEventListener('load', () => {
            setTimeout(() => window.print(), 300);
          });
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=900,height=700');

    if (!printWindow) {
      setMensaje('Permite ventanas emergentes para imprimir el reporte.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }


  function abrirEditarPedido(venta) {
    const itemsIniciales = (venta.detalles || [])
      .filter((item) => item.id_producto)
      .map((item) => ({
        producto_id: Number(item.id_producto),
        cantidad: Number(item.cantidad)
      }));

    setPedidoEditando(venta);
    setEditItems(itemsIniciales);
    setEditNotas(venta.notas || '');
    setProductoNuevoEdit('');
  }

  function agregarProductoAEdicion() {
    const productoId = Number(productoNuevoEdit);

    if (!productoId) {
      setMensaje('Selecciona un producto para agregar.');
      return;
    }

    setEditItems((prev) => {
      const existe = prev.find((item) => Number(item.producto_id) === productoId);

      if (existe) {
        return prev.map((item) =>
          Number(item.producto_id) === productoId
            ? { ...item, cantidad: Number(item.cantidad) + 1 }
            : item
        );
      }

      return [
        ...prev,
        {
          producto_id: productoId,
          cantidad: 1
        }
      ];
    });

    setProductoNuevoEdit('');
  }

  function cambiarCantidadEdicion(productoId, cambio) {
    setEditItems((prev) => {
      return prev
        .map((item) => {
          if (Number(item.producto_id) !== Number(productoId)) return item;

          return {
            ...item,
            cantidad: Math.max(Number(item.cantidad) + cambio, 0)
          };
        })
        .filter((item) => Number(item.cantidad) > 0);
    });
  }

  async function guardarEdicionPedido() {
    try {
      if (!pedidoEditando) return;

      if (editItems.length === 0) {
        setMensaje('El pedido debe tener al menos un producto.');
        return;
      }

      const data = await apiRequest(`/api/ventas/${pedidoEditando.folio}`, {
        method: 'PUT',
        body: JSON.stringify({
          notas: editNotas,
          items: editItems.map((item) => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad
          }))
        })
      });

      setPedidoEditando(null);
      setDetalleVenta(data.venta);
      setMensaje('Pedido actualizado. La comanda o ticket ya saldrá con los cambios.');

      if (adminTab === 'historial') {
        await cargarHistorial(historial.pagina);
      }

      if (adminTab === 'metricas') {
        await cargarDashboard();
      }

      if (adminTab === 'reportes') {
        await cargarReporte();
      }
    } catch (error) {
      setMensaje(error.message);
    }
  }

  async function eliminarPedido(folio) {
    try {
      await apiRequest(`/api/ventas/${folio}`, {
        method: 'DELETE'
      });

      setDetalleVenta(null);
      setPedidoEditando(null);
      setVentaParaCobrar(null);
      setMensaje('Pedido eliminado definitivamente.');

      if (adminTab === 'historial') {
        await cargarHistorial(historial.pagina);
      }

      if (adminTab === 'metricas') {
        await cargarDashboard();
      }

      if (adminTab === 'reportes') {
        await cargarReporte();
      }
    } catch (error) {
      setMensaje(error.message);
    }
  }


  function aplicarPreset(setter, type) {
    setter((prev) => ({
      ...prev,
      ...getPresetRange(type)
    }));
  }


  const editItemsDetallados = useMemo(() => {
    return editItems
      .map((item) => {
        const producto = adminProductos.find((prod) => String(prod.id) === String(item.producto_id));

        if (!producto) return null;

        const cantidad = Number(item.cantidad || 0);
        const precio = Number(producto.precio || 0);

        return {
          ...item,
          nombre: producto.nombre,
          precio,
          subtotal: precio * cantidad
        };
      })
      .filter(Boolean);
  }, [editItems, adminProductos]);

  const totalEdicionPedido = useMemo(() => {
    return editItemsDetallados.reduce((acc, item) => acc + item.subtotal, 0);
  }, [editItemsDetallados]);


  const maxDashboardVenta = Math.max(
    ...(dashboardData?.ventas_por_dia || []).map((item) => Number(item.total)),
    1
  );

  const maxTopProducto = Math.max(
    ...(dashboardData?.top_productos || []).map((item) => Number(item.total)),
    1
  );

  if (!token) {
    return (
      <main className="app auth-only">
        <article className="login-card auth-card">
          <div className="auth-brand">
            <span className="brand-logo">
              <img
                src="/assets/logo/logo.svg"
                alt="Logo"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              <ChefHat size={28} />
            </span>

            <div>
              <h1>Sushi-Mu</h1>
              <p>Gestor de ventas</p>
            </div>
          </div>

          <div className="section-heading">
            <Lock size={22} />
            <div>
              <h2>Iniciar sesión</h2>
              <p>Acceso exclusivo para administrador.</p>
            </div>
          </div>

          <form onSubmit={loginAdmin} className="form-grid" autoComplete="off">
            <label>
              Usuario
              <input
                autoComplete="off"
                placeholder="Usuario"
                value={loginData.username}
                onChange={(event) => setLoginData({ ...loginData, username: event.target.value })}
              />
            </label>

            <label>
              Contraseña
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Contraseña"
                value={loginData.password}
                onChange={(event) => setLoginData({ ...loginData, password: event.target.value })}
              />
            </label>

            <button type="submit" className="primary-btn">
              Entrar
            </button>
          </form>
        </article>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={() => setView('admin')}
          title="Ir al panel de administrador"
        >
          <span className="brand-logo">
            <img
              src="/assets/logo/logo.svg"
              alt="Logo"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
            <ChefHat size={24} />
          </span>

          <span>
            <strong>Sushi-Mu</strong>
            <small>Gestor de ventas</small>
          </span>
        </button>

        <nav className="top-actions">
          {view === 'admin' ? (
            <button className="ghost-btn" type="button" onClick={() => setView('menu')}>
              <ArrowLeft size={18} />
              Volver al menú
            </button>
          ) : (
            <button className="ghost-btn" type="button" onClick={() => setView('admin')}>
              <Settings size={18} />
              Admin
            </button>
          )}
        </nav>
      </header>

      {mensaje && (
        <section className="message-box">
          {mensaje}
          <button type="button" onClick={() => setMensaje('')}>×</button>
        </section>
      )}

      {view === 'menu' ? (
        <>
          <section className="hero">
            <p>Ordena rápido</p>
            <h1>Selecciona tus productos</h1>
            <span>Agrega o quita cantidades desde cada card y genera la orden al final.</span>
          </section>

          <section className="category-scroll">
            <button
              type="button"
              className={categoriaActiva === 'todas' ? 'category-pill active' : 'category-pill'}
              onClick={() => setCategoriaActiva('todas')}
            >
              Todo
            </button>

            {categorias.map((categoria) => (
              <button
                key={categoria.id}
                type="button"
                className={String(categoriaActiva) === String(categoria.id) ? 'category-pill active' : 'category-pill'}
                onClick={() => setCategoriaActiva(categoria.id)}
              >
                {categoria.nombre}
              </button>
            ))}
          </section>

          <section className="product-search-bar">
            <Search size={22} />
            <input
              type="search"
              value={busquedaProducto}
              onChange={(event) => setBusquedaProducto(event.target.value)}
              placeholder="Buscar por nombre..."
            />

            {busquedaProducto && (
              <button type="button" onClick={() => setBusquedaProducto('')}>
                Limpiar
              </button>
            )}
          </section>

          {loading ? (
            <section className="empty-state">Cargando productos...</section>
          ) : productosFiltrados.length === 0 ? (
            <section className="empty-state">No hay productos disponibles en esta categoría.</section>
          ) : (
            <section className="products-grid">
              {productosFiltrados.map((producto) => {
                const cantidad = carrito[producto.id] || 0;

                return (
                  <article className="product-card" key={producto.id}>
                    <div className="product-image">
                      {producto.imagen_url ? (
                        <img
                          src={resolveImageUrl(producto.imagen_url)}
                          alt={producto.nombre}
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <ChefHat size={54} />
                      )}
                    </div>

                    <div className="product-body">
                      <span className="product-category">{producto.categoria}</span>
                      <h3>{producto.nombre}</h3>
                      <p>{producto.descripcion || 'Producto del menú.'}</p>
                      <strong>{money(producto.precio)}</strong>
                    </div>

                    <div className="product-actions">
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => quitarProducto(producto.id)}
                        disabled={cantidad === 0}
                      >
                        <Minus size={18} />
                        Quitar
                      </button>

                      <span className="quantity-badge">{cantidad}</span>

                      <button
                        type="button"
                        className="add-btn"
                        onClick={() => agregarProducto(producto.id)}
                      >
                        <Plus size={18} />
                        Añadir
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          <section className="cart-bar">
            <div>
              <span>{totalItems} productos</span>
              <strong>{money(total)}</strong>
            </div>

            <button
              type="button"
              disabled={itemsCarrito.length === 0}
              onClick={() => setOrdenModal(true)}
            >
              <ShoppingBag size={20} />
              Mandar a cocina
            </button>
          </section>
        </>
      ) : (
        <section className="admin-panel">
          {!token ? (
            <article className="login-card">
              <div className="section-heading">
                <Lock size={22} />
                <div>
                  <h2>Panel de administrador</h2>
                  <p>Inicia sesión para administrar productos, pedidos, métricas y reportes.</p>
                </div>
              </div>

              <form onSubmit={loginAdmin} className="form-grid" autoComplete="off">
                <label>
                  Usuario
                  <input
                    autoComplete="off"
                    placeholder="Usuario"
                    value={loginData.username}
                    onChange={(event) => setLoginData({ ...loginData, username: event.target.value })}
                  />
                </label>

                <label>
                  Contraseña
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Contraseña"
                    value={loginData.password}
                    onChange={(event) => setLoginData({ ...loginData, password: event.target.value })}
                  />
                </label>

                <button type="submit" className="primary-btn">
                  Entrar
                </button>
              </form>
            </article>
          ) : (
            <>
              <div className="admin-header">
                <div>
                  <h1>Administrador</h1>
                  <p>Gestiona menú, pedidos, métricas y reportes del negocio.</p>
                </div>

                <button type="button" className="danger-btn" onClick={logoutAdmin}>
                  <LogOut size={18} />
                  Cerrar sesión
                </button>
              </div>

              <section className="admin-tabs">
                {adminTabs.map((tab) => {
                  const Icon = tab.icon;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      className={adminTab === tab.key ? 'admin-tab active' : 'admin-tab'}
                      onClick={() => setAdminTab(tab.key)}
                    >
                      <Icon size={18} />
                      {tab.label}
                    </button>
                  );
                })}
              </section>

              {adminTab === 'categoria' && (
                <section className="admin-grid single-left">
                  <article className="admin-card">
                    <div className="section-heading">
                      <Tags size={22} />
                      <div>
                        <h2>Crear categoría</h2>
                        <p>Crea categorías para organizar el menú.</p>
                      </div>
                    </div>

                    <form onSubmit={crearCategoria} className="form-grid">
                      <label>
                        Nombre
                        <input
                          required
                          value={categoriaForm.nombre}
                          onChange={(event) => setCategoriaForm({ ...categoriaForm, nombre: event.target.value })}
                          placeholder="Rollos"
                        />
                      </label>

                      <label>
                        Descripción
                        <input
                          value={categoriaForm.descripcion}
                          onChange={(event) => setCategoriaForm({ ...categoriaForm, descripcion: event.target.value })}
                          placeholder="Rollos clásicos y especiales"
                        />
                      </label>

                      <label>
                        Orden
                        <input
                          type="number"
                          value={categoriaForm.orden}
                          onChange={(event) => setCategoriaForm({ ...categoriaForm, orden: Number(event.target.value) })}
                        />
                      </label>

                      <button type="submit" className="primary-btn">
                        Crear categoría
                      </button>
                    </form>
                  </article>

                  <article className="admin-card">
                    <div className="section-heading">
                      <ListOrdered size={22} />
                      <div>
                        <h2>Categorías existentes</h2>
                        <p>Eliminar una categoría borra definitivamente sus productos.</p>
                      </div>
                    </div>

                    <div className="admin-list">
                      {adminCategorias.map((categoria) => (
                        <div className="admin-row" key={categoria.id}>
                          <div>
                            <strong>{categoria.nombre}</strong>
                            <small>{categoria.activo ? 'Activa' : 'Inactiva'}</small>
                          </div>

                          <button
                            type="button"
                            className="icon-danger"
                            onClick={() => setConfirmacion({
                              title: 'Eliminar categoría',
                              text: `¿Seguro que quieres eliminar "${categoria.nombre}"? También se eliminarán definitivamente sus productos asociados.`,
                              onConfirm: () => eliminarCategoria(categoria.id)
                            })}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>
                </section>
              )}

              {adminTab === 'producto' && (
                <section className="admin-grid single-left">
                  <article className="admin-card">
                    <div className="section-heading">
                      <ChefHat size={22} />
                      <div>
                        <h2>Crear producto</h2>
                        <p>Agrega productos y asígnalos a una categoría.</p>
                      </div>
                    </div>

                    <form onSubmit={crearProducto} className="form-grid">
                      <label>
                        Categoría
                        <select
                          required
                          value={productoForm.id_categoria}
                          onChange={(event) => setProductoForm({ ...productoForm, id_categoria: event.target.value })}
                        >
                          <option value="">Selecciona una categoría</option>
                          {adminCategorias
                            .filter((categoria) => categoria.activo)
                            .map((categoria) => (
                              <option key={categoria.id} value={categoria.id}>
                                {categoria.nombre}
                              </option>
                            ))}
                        </select>
                      </label>

                      <label>
                        Nombre
                        <input
                          required
                          value={productoForm.nombre}
                          onChange={(event) => setProductoForm({ ...productoForm, nombre: event.target.value })}
                          placeholder="California roll"
                        />
                      </label>

                      <label>
                        Precio
                        <input
                          required
                          type="number"
                          step="0.01"
                          min="0"
                          value={productoForm.precio}
                          onChange={(event) => setProductoForm({ ...productoForm, precio: event.target.value })}
                          placeholder="95"
                        />
                      </label>

                      <label className="full-field">
                        Imagen del producto
                        <div
                          className={productoForm.imagen_url ? 'dropzone has-image' : 'dropzone'}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={async (event) => {
                            event.preventDefault();
                            const file = event.dataTransfer.files?.[0];
                            await manejarImagenProducto(file);
                          }}
                          onClick={() => document.getElementById('producto-imagen-input')?.click()}
                        >
                          <input
                            id="producto-imagen-input"
                            type="file"
                            accept="image/*"
                            onChange={async (event) => {
                              const file = event.target.files?.[0];
                              await manejarImagenProducto(file);
                              event.target.value = '';
                            }}
                          />

                          {productoForm.imagen_url ? (
                            <div className="dropzone-preview">
                              <img src={productoForm.imagen_url} alt="Vista previa del producto" />
                              <span>Clic o arrastra otra imagen para cambiarla</span>
                            </div>
                          ) : (
                            <div className="dropzone-placeholder">
                              <ChefHat size={36} />
                              <strong>Arrastra una imagen aquí</strong>
                              <span>o haz clic para seleccionarla</span>
                              <small>Se comprimirá automáticamente en WebP.</small>
                            </div>
                          )}
                        </div>

                        {productoForm.imagen_url && (
                          <button
                            type="button"
                            className="image-remove-btn"
                            onClick={quitarImagenProducto}
                          >
                            Quitar imagen
                          </button>
                        )}
                      </label>

                      <label className="full-field">
                        Descripción
                        <textarea
                          value={productoForm.descripcion}
                          onChange={(event) => setProductoForm({ ...productoForm, descripcion: event.target.value })}
                          placeholder="Descripción breve del producto"
                        />
                      </label>

                      <button type="submit" className="primary-btn">
                        Crear producto
                      </button>
                    </form>
                  </article>

                  <article className="admin-card">
                    <div className="section-heading">
                      <Boxes size={22} />
                      <div>
                        <h2>Productos existentes</h2>
                        <p>Productos actualmente registrados.</p>
                      </div>
                    </div>

                    <div className="admin-list">
                      {adminProductos.map((producto) => (
                        <div className="admin-row" key={producto.id}>
                          <div>
                            <strong>{producto.nombre}</strong>
                            <small>
                              {producto.categoria} · {money(producto.precio)} · {producto.activo ? 'Activo' : 'Inactivo'}
                            </small>
                          </div>

                          <button
                            type="button"
                            className="icon-danger"
                            onClick={() => setConfirmacion({
                              title: 'Eliminar producto',
                              text: `¿Seguro que quieres eliminar "${producto.nombre}" definitivamente?`,
                              onConfirm: () => eliminarProducto(producto.id)
                            })}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>
                </section>
              )}

              {adminTab === 'historial' && (
                <section className="admin-card">
                  <div className="section-heading between">
                    <div className="heading-inline">
                      <ListOrdered size={22} />
                      <div>
                        <h2>Historial de pedidos</h2>
                        <p>Máximo 20 pedidos por página, con detalle y reimpresión de ticket.</p>
                      </div>
                    </div>

                    <button type="button" className="ghost-btn" onClick={() => cargarHistorial(historial.pagina)}>
                      <RefreshCw size={18} />
                      Actualizar
                    </button>
                  </div>

                  <div className="filter-grid">
                    <label>
                      Buscar folio
                      <input
                        value={historialFiltros.folio}
                        onChange={(event) => setHistorialFiltros({ ...historialFiltros, folio: event.target.value })}
                        placeholder="S-000001"
                      />
                    </label>

                    <label>
                      Desde
                      <input
                        type="date"
                        value={historialFiltros.fecha_desde}
                        onChange={(event) => setHistorialFiltros({ ...historialFiltros, fecha_desde: event.target.value })}
                      />
                    </label>

                    <label>
                      Hasta
                      <input
                        type="date"
                        value={historialFiltros.fecha_hasta}
                        onChange={(event) => setHistorialFiltros({ ...historialFiltros, fecha_hasta: event.target.value })}
                      />
                    </label>

                    <button type="button" className="primary-btn" onClick={() => cargarHistorial(1)}>
                      <Search size={18} />
                      Buscar
                    </button>
                  </div>

                  <div className="table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Orden</th>
                          <th>Fecha y hora</th>
                          <th>Pago</th>
                          <th>Productos</th>
                          <th>Total</th>
                          <th>Cambio</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historial.ventas.map((venta) => (
                          <tr key={venta.id}>
                            <td>{venta.folio}</td>
                            <td>{formatDate(venta.creado_en)}</td>
                            <td>{venta.metodo_pago}</td>
                            <td>{venta.total_productos}</td>
                            <td>{money(venta.total)}</td>
                            <td>{money(venta.cambio)}</td>
                            <td>
                              <button type="button" className="mini-btn" onClick={() => cargarDetalleVenta(venta.folio)}>
                                <Eye size={15} />
                                Ver
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="pagination">
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={historial.pagina <= 1}
                      onClick={() => cargarHistorial(historial.pagina - 1)}
                    >
                      Anterior
                    </button>

                    <span>
                      Página {historial.pagina} de {historial.total_paginas} · {historial.total_registros} pedidos
                    </span>

                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={historial.pagina >= historial.total_paginas}
                      onClick={() => cargarHistorial(historial.pagina + 1)}
                    >
                      Siguiente
                    </button>
                  </div>
                </section>
              )}

              {adminTab === 'metricas' && (
                <section className="admin-card">
                  <div className="section-heading between">
                    <div className="heading-inline">
                      <BarChart3 size={22} />
                      <div>
                        <h2>Dashboard empresarial</h2>
                        <p>Métricas de venta con filtros por fecha y producto.</p>
                      </div>
                    </div>

                    <button type="button" className="ghost-btn" onClick={cargarDashboard}>
                      <RefreshCw size={18} />
                      Actualizar
                    </button>
                  </div>

                  <div className="preset-row">
                    {['hoy', 'dia', 'semanal', 'mensual', 'anual'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="category-pill"
                        onClick={() => aplicarPreset(setDashboardFiltros, preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <div className="filter-grid dashboard-filter">
                    <label>
                      Desde
                      <input
                        type="date"
                        value={dashboardFiltros.fecha_desde}
                        onChange={(event) => setDashboardFiltros({ ...dashboardFiltros, fecha_desde: event.target.value })}
                      />
                    </label>

                    <label>
                      Hasta
                      <input
                        type="date"
                        value={dashboardFiltros.fecha_hasta}
                        onChange={(event) => setDashboardFiltros({ ...dashboardFiltros, fecha_hasta: event.target.value })}
                      />
                    </label>

                    <label>
                      Producto
                      <select
                        value={dashboardFiltros.id_producto}
                        onChange={(event) => setDashboardFiltros({ ...dashboardFiltros, id_producto: event.target.value })}
                      >
                        <option value="">Todos</option>
                        {adminProductos.map((producto) => (
                          <option key={producto.id} value={producto.id}>
                            {producto.nombre}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button type="button" className="primary-btn" onClick={cargarDashboard}>
                      <BarChart3 size={18} />
                      Aplicar
                    </button>
                  </div>

                  {dashboardData && (
                    <>
                      <section className="metric-grid">
                        <article className="metric-card">
                          <span>Total vendido</span>
                          <strong>{money(dashboardData.resumen.total_vendido)}</strong>
                        </article>

                        <article className="metric-card">
                          <span>Órdenes</span>
                          <strong>{dashboardData.resumen.total_ordenes}</strong>
                        </article>

                        <article className="metric-card">
                          <span>Productos vendidos</span>
                          <strong>{dashboardData.resumen.productos_vendidos}</strong>
                        </article>

                        <article className="metric-card">
                          <span>Ticket promedio</span>
                          <strong>{money(dashboardData.resumen.ticket_promedio)}</strong>
                        </article>
                      </section>

                      <section className="charts-grid">
                        <article className="chart-card">
                          <h3>Ventas por día</h3>

                          <div className="bar-chart">
                            {dashboardData.ventas_por_dia.length === 0 && (
                              <p className="muted-text">Sin ventas en este rango.</p>
                            )}

                            {dashboardData.ventas_por_dia.map((item) => (
                              <div className="bar-row" key={item.fecha}>
                                <span>{item.fecha}</span>
                                <div>
                                  <i style={{ width: `${Math.max((item.total / maxDashboardVenta) * 100, 4)}%` }} />
                                </div>
                                <strong>{money(item.total)}</strong>
                              </div>
                            ))}
                          </div>
                        </article>

                        <article className="chart-card">
                          <h3>Top productos</h3>

                          <div className="bar-chart">
                            {dashboardData.top_productos.length === 0 && (
                              <p className="muted-text">Sin productos vendidos en este rango.</p>
                            )}

                            {dashboardData.top_productos.map((item) => (
                              <div className="bar-row" key={item.nombre}>
                                <span>{item.nombre}</span>
                                <div>
                                  <i style={{ width: `${Math.max((item.total / maxTopProducto) * 100, 4)}%` }} />
                                </div>
                                <strong>{money(item.total)}</strong>
                              </div>
                            ))}
                          </div>
                        </article>

                        <article className="chart-card wide-chart">
                          <h3>Métodos de pago</h3>

                          <div className="payment-summary">
                            {dashboardData.metodos_pago.map((item) => (
                              <div key={item.metodo}>
                                <span>{item.metodo}</span>
                                <strong>{money(item.total)}</strong>
                                <small>{item.ordenes} órdenes</small>
                              </div>
                            ))}
                          </div>
                        </article>
                      </section>
                    </>
                  )}
                </section>
              )}

              {adminTab === 'reportes' && (
                <section className="admin-card">
                  <div className="section-heading between">
                    <div className="heading-inline">
                      <FileText size={22} />
                      <div>
                        <h2>Reportes de venta</h2>
                        <p>Reporte imprimible con número de orden, precio y sumatoria total.</p>
                      </div>
                    </div>

                    <button type="button" className="primary-btn" onClick={imprimirReporte} disabled={!reporteData}>
                      <Printer size={18} />
                      Imprimir reporte
                    </button>
                  </div>

                  <div className="preset-row">
                    {['hoy', 'dia', 'semanal', 'mensual', 'anual'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="category-pill"
                        onClick={() => aplicarPreset(setReporteFiltros, preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <div className="filter-grid dashboard-filter">
                    <label>
                      Desde
                      <input
                        type="date"
                        value={reporteFiltros.fecha_desde}
                        onChange={(event) => setReporteFiltros({ ...reporteFiltros, fecha_desde: event.target.value })}
                      />
                    </label>

                    <label>
                      Hasta
                      <input
                        type="date"
                        value={reporteFiltros.fecha_hasta}
                        onChange={(event) => setReporteFiltros({ ...reporteFiltros, fecha_hasta: event.target.value })}
                      />
                    </label>

                    <label>
                      Producto
                      <select
                        value={reporteFiltros.id_producto}
                        onChange={(event) => setReporteFiltros({ ...reporteFiltros, id_producto: event.target.value })}
                      >
                        <option value="">Todos</option>
                        {adminProductos.map((producto) => (
                          <option key={producto.id} value={producto.id}>
                            {producto.nombre}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button type="button" className="primary-btn" onClick={cargarReporte}>
                      <Search size={18} />
                      Generar
                    </button>
                  </div>

                  {reporteData && (
                    <>
                      <div className="report-total">
                        <span>Total del reporte</span>
                        <strong>{money(reporteData.total)}</strong>
                        <small>{reporteData.total_registros} registros</small>
                      </div>

                      <div className="table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Número de orden</th>
                              <th>Fecha</th>
                              <th>Precio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reporteData.filas.map((fila, index) => (
                              <tr key={`${fila.folio}-${index}`}>
                                <td>{fila.folio}</td>
                                <td>{formatDate(fila.creado_en)}</td>
                                <td>{money(fila.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </section>
      )}

      {ordenModal && (
        <section className="modal-backdrop">
          <article className="modal-card">
            <div className="modal-header">
              <h2>Mandar a cocina</h2>
              <button type="button" onClick={() => setOrdenModal(false)}>×</button>
            </div>

            <div className="order-summary">
              {itemsCarrito.map((item) => (
                <div key={item.id}>
                  <span>{item.cantidad} x {item.nombre}</span>
                  <strong>{money(item.subtotal)}</strong>
                </div>
              ))}

              <div className="summary-total">
                <span>Total de la orden</span>
                <strong>{money(total)}</strong>
              </div>
            </div>

            <label className="cash-input">
              Notas para cocina
              <textarea
                value={notas}
                onChange={(event) => setNotas(event.target.value)}
                placeholder="Ej. Sin ajonjolí, sin picante, extra salsa..."
              />
            </label>

            <div className="ticket-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setOrdenModal(false)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="primary-btn"
                disabled={ordenProcesando}
                onClick={generarOrden}
              >
                <Printer size={18} />
                {ordenProcesando ? 'Enviando...' : 'Confirmar pedido'}
              </button>
            </div>
          </article>
        </section>
      )}

      {ventaParaCobrar && (
        <section className="modal-backdrop modal-top">
          <article className="modal-card">
            <div className="modal-header">
              <h2>Cobrar {ventaParaCobrar.folio}</h2>
              <button type="button" onClick={() => setVentaParaCobrar(null)}>×</button>
            </div>

            <div className="order-summary">
              {(ventaParaCobrar.detalles || []).map((item) => (
                <div key={item.id}>
                  <span>{item.cantidad} x {item.producto_nombre}</span>
                  <strong>{money(item.subtotal)}</strong>
                </div>
              ))}

              <div className="summary-total">
                <span>Total a cobrar</span>
                <strong>{money(ventaParaCobrar.total)}</strong>
              </div>
            </div>

            <h3>Método de pago</h3>

            <div className="payment-grid">
              {paymentMethods.map((method) => {
                const Icon = method.icon;

                return (
                  <button
                    key={method.key}
                    type="button"
                    className={metodoPago === method.key ? 'payment-btn active' : 'payment-btn'}
                    onClick={() => setMetodoPago(method.key)}
                  >
                    <Icon size={20} />
                    {method.label}
                  </button>
                );
              })}
            </div>

            {metodoPago === 'efectivo' && (
              <label className="cash-input">
                ¿Con cuánto paga?
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoRecibido}
                  onChange={(event) => setMontoRecibido(event.target.value)}
                  placeholder="Ej. 500"
                />

                <small>
                  Cambio: {money(Math.max(Number(montoRecibido || 0) - Number(ventaParaCobrar.total || 0), 0))}
                </small>
              </label>
            )}

            <button type="button" className="primary-btn wide" onClick={cobrarOrden}>
              Cobrar e imprimir ticket
            </button>
          </article>
        </section>
      )}

      {payModal && (
        <section className="modal-backdrop">
          <article className="modal-card">
            <div className="modal-header">
              <h2>Mandar a cocina</h2>
              <button type="button" onClick={() => setPayModal(false)}>×</button>
            </div>

            <div className="order-summary">
              {itemsCarrito.map((item) => (
                <div key={item.id}>
                  <span>{item.cantidad} x {item.nombre}</span>
                  <strong>{money(item.subtotal)}</strong>
                </div>
              ))}

              <div className="summary-total">
                <span>Total</span>
                <strong>{money(total)}</strong>
              </div>
            </div>

            <h3>Método de pago</h3>

            <div className="payment-grid">
              {paymentMethods.map((method) => {
                const Icon = method.icon;

                return (
                  <button
                    key={method.key}
                    type="button"
                    className={metodoPago === method.key ? 'payment-btn active' : 'payment-btn'}
                    onClick={() => setMetodoPago(method.key)}
                  >
                    <Icon size={20} />
                    {method.label}
                  </button>
                );
              })}
            </div>

            {metodoPago === 'efectivo' && (
              <label className="cash-input">
                ¿Con cuánto paga?
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoRecibido}
                  onChange={(event) => setMontoRecibido(event.target.value)}
                  placeholder="Ej. 500"
                />

                <small>Cambio: {money(cambioCalculado)}</small>
              </label>
            )}

            <label className="cash-input">
              Notas de la orden
              <textarea
                value={notas}
                onChange={(event) => setNotas(event.target.value)}
                placeholder="Ej. Sin ajonjolí, extra salsa..."
              />
            </label>

            <button type="button" className="primary-btn wide" onClick={generarOrden}>
              Generar ticket
            </button>
          </article>
        </section>
      )}

      {comanda && (
        <section className="modal-backdrop">
          <article className="ticket-card">
            <div className="ticket-header">
              <h2>Sushi-Mu</h2>
              <p>COMANDA COCINA</p>
            </div>

            <div className="ticket-meta">
              <span>Orden:</span>
              <strong>{comanda.folio}</strong>

              <span>Fecha:</span>
              <strong>{formatDate(comanda.fecha)}</strong>
            </div>

            <div className="ticket-items">
              {comanda.productos.map((item, index) => (
                <div key={`${item.nombre}-${index}`}>
                  <span>{item.cantidad} x {item.nombre}</span>
                </div>
              ))}
            </div>

            {comanda.notas && (
              <p className="ticket-notes">
                Notas: {comanda.notas}
              </p>
            )}

            <p className="ticket-thanks">Enviar a cocina 🍣</p>

            <div className="ticket-actions no-print">
              <button type="button" className="ghost-btn dark" onClick={() => setComanda(null)}>
                Cerrar
              </button>

              <button type="button" className="primary-btn" onClick={() => imprimirComandaRawBT(comanda)}>
                <Printer size={18} />
                Imprimir comanda
              </button>
            </div>
          </article>
        </section>
      )}

      {ticket && (
        <section className="modal-backdrop">
          <article className="ticket-card" id="ticket-print">
            <div className="ticket-header">
              <h2>Sushi-Mu</h2>
              <p>Ticket de venta</p>
            </div>

            <div className="ticket-meta">
              <span>Folio:</span>
              <strong>{ticket.folio}</strong>

              <span>Fecha:</span>
              <strong>{formatDate(ticket.fecha)}</strong>

              <span>Pago:</span>
              <strong>{ticket.metodo_pago}</strong>
            </div>

            <div className="ticket-items">
              {ticket.productos.map((item, index) => (
                <div key={`${item.nombre}-${index}`}>
                  <span>{item.cantidad} x {item.nombre}</span>
                  <strong>{money(item.subtotal)}</strong>
                </div>
              ))}
            </div>

            {ticket.notas && (
              <p className="ticket-notes">
                Notas: {ticket.notas}
              </p>
            )}

            <div className="ticket-total">
              <span>Total</span>
              <strong>{money(ticket.total)}</strong>
            </div>

            {ticket.monto_recibido !== null && (
              <>
                <div className="ticket-line">
                  <span>Recibido</span>
                  <strong>{money(ticket.monto_recibido)}</strong>
                </div>

                <div className="ticket-line">
                  <span>Cambio</span>
                  <strong>{money(ticket.cambio)}</strong>
                </div>
              </>
            )}

            <p className="ticket-thanks">Gracias por su compra 🍣</p>

            <div className="ticket-actions no-print">
              <button type="button" className="ghost-btn dark" onClick={() => setTicket(null)}>
                Cerrar
              </button>

              <button type="button" className="ghost-btn dark" onClick={() => copiarTicketTexto(ticket)}>
                Copiar
              </button>

              <button type="button" className="primary-btn" onClick={() => imprimirTicketRawBT(ticket)}>
                <Printer size={18} />
                Imprimir RawBT
              </button>
            </div>
          </article>
        </section>
      )}

      {pedidoEditando && (
        <section className="modal-backdrop modal-top">
          <article className="modal-card sale-detail-card">
            <div className="modal-header">
              <h2>Editar {pedidoEditando.folio}</h2>
              <button type="button" onClick={() => setPedidoEditando(null)}>×</button>
            </div>

            <div className="edit-add-row">
              <label>
                Agregar producto
                <select
                  value={productoNuevoEdit}
                  onChange={(event) => setProductoNuevoEdit(event.target.value)}
                >
                  <option value="">Selecciona producto</option>
                  {adminProductos
                    .filter((producto) => producto.activo)
                    .map((producto) => (
                      <option key={producto.id} value={producto.id}>
                        {producto.nombre} - {money(producto.precio)}
                      </option>
                    ))}
                </select>
              </label>

              <button type="button" className="primary-btn" onClick={agregarProductoAEdicion}>
                <Plus size={18} />
                Agregar
              </button>
            </div>

            <div className="edit-items-list">
              {editItemsDetallados.map((item) => (
                <div className="edit-item-row" key={item.producto_id}>
                  <div>
                    <strong>{item.nombre}</strong>
                    <small>{money(item.precio)} c/u · Subtotal {money(item.subtotal)}</small>
                  </div>

                  <div className="edit-qty-actions">
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => cambiarCantidadEdicion(item.producto_id, -1)}
                    >
                      <Minus size={16} />
                    </button>

                    <span>{item.cantidad}</span>

                    <button
                      type="button"
                      className="add-btn"
                      onClick={() => cambiarCantidadEdicion(item.producto_id, 1)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              ))}

              {editItemsDetallados.length === 0 && (
                <p className="muted-text">Agrega al menos un producto al pedido.</p>
              )}
            </div>

            <label className="cash-input">
              Notas del pedido
              <textarea
                value={editNotas}
                onChange={(event) => setEditNotas(event.target.value)}
                placeholder="Notas para cocina o ajustes del pedido..."
              />
            </label>

            <div className="summary-total edit-total">
              <span>Nuevo total</span>
              <strong>{money(totalEdicionPedido)}</strong>
            </div>

            <div className="ticket-actions">
              <button type="button" className="ghost-btn" onClick={() => setPedidoEditando(null)}>
                Cancelar
              </button>

              <button type="button" className="primary-btn" onClick={guardarEdicionPedido}>
                Guardar cambios
              </button>
            </div>
          </article>
        </section>
      )}

      {detalleVenta && !ventaParaCobrar && (
        <section className="modal-backdrop">
          <article className="modal-card sale-detail-card">
            <div className="modal-header">
              <h2>Pedido {detalleVenta.folio}</h2>
              <button type="button" onClick={() => setDetalleVenta(null)}>×</button>
            </div>

            <div className="ticket-meta dark-meta">
              <span>Fecha:</span>
              <strong>{formatDate(detalleVenta.creado_en)}</strong>

              <span>Pago:</span>
              <strong>{detalleVenta.metodo_pago}</strong>

              <span>Total:</span>
              <strong>{money(detalleVenta.total)}</strong>

              <span>Cambio:</span>
              <strong>{money(detalleVenta.cambio)}</strong>
            </div>

            <div className="detail-products">
              {(detalleVenta.detalles || []).map((item) => (
                <div key={item.id}>
                  <span>{item.cantidad} x {item.producto_nombre}</span>
                  <strong>{money(item.subtotal)}</strong>
                </div>
              ))}
            </div>

            {detalleVenta.notas && (
              <p className="ticket-notes dark-notes">
                Notas: {detalleVenta.notas}
              </p>
            )}

            <div className="ticket-actions detail-extra-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => abrirEditarPedido(detalleVenta)}
              >
                <Pencil size={18} />
                Editar pedido
              </button>

              <button
                type="button"
                className="danger-btn"
                onClick={() => setConfirmacion({
                  title: 'Eliminar pedido',
                  text: `¿Seguro que quieres eliminar ${detalleVenta.folio}? Esto no se puede deshacer.`,
                  onConfirm: () => eliminarPedido(detalleVenta.folio)
                })}
              >
                <Trash2 size={18} />
                Eliminar
              </button>
            </div>

            <div className="ticket-actions">
              <button type="button" className="ghost-btn" onClick={() => setDetalleVenta(null)}>
                Cerrar
              </button>

              {detalleVenta.estado === 'pagada' ? (
                <>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => copiarTicketTexto(ticketFromVenta(detalleVenta))}
                  >
                    Copiar ticket
                  </button>

                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => imprimirTicketRawBT(ticketFromVenta(detalleVenta))}
                  >
                    <Printer size={18} />
                    Reimprimir ticket
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => imprimirComandaRawBT({
                      folio: detalleVenta.folio,
                      fecha: detalleVenta.creado_en,
                      notas: detalleVenta.notas,
                      total: Number(detalleVenta.total),
                      productos: (detalleVenta.detalles || []).map((item) => ({
                        nombre: item.producto_nombre,
                        cantidad: item.cantidad,
                        precio_unitario: Number(item.precio_unitario),
                        subtotal: Number(item.subtotal)
                      }))
                    })}
                  >
                    <Printer size={18} />
                    Reimprimir comanda
                  </button>

                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      setVentaParaCobrar(detalleVenta);
                      setDetalleVenta(null);
                      setMetodoPago('efectivo');
                      setMontoRecibido('');
                    }}
                  >
                    <Banknote size={18} />
                    Cobrar pedido
                  </button>
                </>
              )}
            </div>
          </article>
        </section>
      )}

      {confirmacion && (
        <section className="modal-backdrop">
          <article className="confirm-card">
            <h2>{confirmacion.title}</h2>
            <p>{confirmacion.text}</p>

            <div className="confirm-actions">
              <button type="button" className="ghost-btn dark" onClick={() => setConfirmacion(null)}>
                Cancelar
              </button>

              <button
                type="button"
                className="danger-btn"
                onClick={async () => {
                  const action = confirmacion.onConfirm;
                  setConfirmacion(null);
                  await action();
                }}
              >
                Eliminar
              </button>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}

export default App;
