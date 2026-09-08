import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

function App() {
  const [dataByAgentJira, setDataByAgentJira] = useState([]);
  const [dataByAgentConnect, setDataByAgentConnect] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState("");

  const weekFile = "/Week 31.8.xlsx";
  const connectFile = "/Connect 31.8.xlsx";

  // Helper para convertir cualquier número (con punto o coma) de forma segura
  const parseNumero = (val) => {
    if (val === undefined || val === null || val === "") return 0;
    if (typeof val === "number") return val;
    const limpio = val.toString().replace(",", ".").trim();
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
  };

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setCurrentWeek(weekFile.replace("/", "").replace(".xlsx", ""));

        const [resWeek, resConnect] = await Promise.all([
          fetch(`${weekFile}?v=${new Date().getTime()}`),
          fetch(`${connectFile}?v=${new Date().getTime()}`)
        ]);

        if (!resWeek.ok) console.error("Error al cargar Week 29.6.xlsx:", resWeek.statusText);
        if (!resConnect.ok) console.error("Error al cargar Connect 29.6.xlsx:", resConnect.statusText);

        const bufferWeek = await resWeek.arrayBuffer();
        const bufferConnect = await resConnect.arrayBuffer();

        // Lectura Jira (Week)
        const wbWeek = XLSX.read(bufferWeek);
        const sheetWeek = wbWeek.Sheets[wbWeek.SheetNames[0]];
        const jsonWeek = XLSX.utils.sheet_to_json(sheetWeek);
        procesarDatosJira(jsonWeek);

        // Lectura Connect
        const wbConnect = XLSX.read(bufferConnect);
        const sheetConnect = wbConnect.Sheets[wbConnect.SheetNames[0]];
        const jsonConnect = XLSX.utils.sheet_to_json(sheetConnect);
        procesarDatosConnect(jsonConnect);

      } catch (error) {
        console.error("Error crítico al cargar los archivos:", error);
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();
  }, []);

  const calcularMediana = (arr) => {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 
      ? sorted[mid] 
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  // --- LÓGICA DE JIRA (WEEK) ---
  const procesarDatosJira = (jsonData) => {
    const agentStats = {};

    jsonData.forEach(row => {
      const agent = row["Persona asignada"] || "Sin asignar";
      const estadoRaw = (row["Estado"] || "").toString().toLowerCase().trim();
      const esEstadoFinalizado = estadoRaw.includes("finaliz");
      
      const rawEscalado = row["SD - Escalado"];
      const esEscalado = rawEscalado !== undefined && rawEscalado !== null && rawEscalado.toString().trim() !== "";
      
      const tiempoAbierto = parseNumero(row["Mediana Tiempoabierto"]);
      const frTimeMin = parseNumero(row["Mediana de FRT"]);
      
      const rawSatisfaction = row["Satisfaction"];
      const tieneSatisfaction = rawSatisfaction !== undefined && rawSatisfaction !== null && rawSatisfaction !== "";
      const valorSatisfaction = parseNumero(rawSatisfaction);

      if (!agentStats[agent]) {
        agentStats[agent] = {
          name: agent,
          totalTickets: 0,
          escaladosCount: 0,
          declinadosCount: 0,
          frTimes: [],
          tiemposEscalados: [],
          tiemposNoEscalados: [],
          sumaSatisfaccionFinalizada: 0,
          countFinalizadasConNota: 0,
          dsatBajosFinalizados: 0,
          countFinalizadasTotales: 0
        };
      }

      const s = agentStats[agent];
      s.totalTickets += 1;

      if (esEscalado) s.escaladosCount += 1;
      if (estadoRaw === "declined") s.declinadosCount += 1;
      
      if (esEscalado) {
        s.tiemposEscalados.push(tiempoAbierto);
      } else {
        s.tiemposNoEscalados.push(tiempoAbierto);
      }

      if (frTimeMin > 0) s.frTimes.push(frTimeMin);

      if (esEstadoFinalizado) {
        s.countFinalizadasTotales += 1;

        if (tieneSatisfaction) {
          s.countFinalizadasConNota += 1;
          s.sumaSatisfaccionFinalizada += valorSatisfaction;

          if (valorSatisfaction === 1 || valorSatisfaction === 2) {
            s.dsatBajosFinalizados += 1;
          }
        }
      }
    });

    const finalData = Object.values(agentStats).map(s => {
      // AHORA USA LA MEDIANA EN LUGAR DEL PROMEDIO
      const medianaFR = calcularMediana(s.frTimes);
      
      return {
        name: s.name,
        porcentajeEscalados: s.totalTickets > 0 ? ((s.escaladosCount / s.totalTickets) * 100).toFixed(2) + "%" : "0%",
        porcentajeDeclinados: s.totalTickets > 0 ? ((s.declinadosCount / s.totalTickets) * 100).toFixed(2) + "%" : "0%",
        inicioGestionMin: medianaFR.toFixed(2) + " min",
        resTimeSinEscalarMediana: calcularMediana(s.tiemposNoEscalados).toFixed(2) + " h",
        resTimeEscaladoMediana: calcularMediana(s.tiemposEscalados).toFixed(2) + " h",
        csat: s.countFinalizadasConNota > 0 ? (s.sumaSatisfaccionFinalizada / s.countFinalizadasConNota).toFixed(2) : "0.00",
        dsat: s.countFinalizadasConNota > 0 ? ((s.dsatBajosFinalizados / s.countFinalizadasConNota) * 100).toFixed(2) + "%" : "0%",
        answerRate: s.countFinalizadasTotales > 0 ? ((s.countFinalizadasConNota / s.countFinalizadasTotales) * 100).toFixed(2) + "%" : "0%"
      };
    });

    setDataByAgentJira(finalData);
  };

  // --- LÓGICA DE CONNECT ---
  const procesarDatosConnect = (jsonData) => {
    const agentStats = {};

    jsonData.forEach(row => {
      const agent = (row["FRT_BY"] || "Sin asignar").toString().trim();
      
      const rawCsat = row["CSAT"];
      const rawFrt = row["FIRST_RESPONSE_TIME_MIN"];
      const rawRes = row["RESOLUTION_TIME_MIN"];

      const valorCsat = parseNumero(rawCsat);
      const valorFrt = parseNumero(rawFrt);
      const valorRes = parseNumero(rawRes);

      if (!agentStats[agent]) {
        agentStats[agent] = {
          name: agent,
          inflow: 0,
          sumaCsat: 0,
          countCsat: 0,
          sumaFrt: 0,
          countFrt: 0,
          sumaRes: 0,
          countRes: 0
        };
      }

      const s = agentStats[agent];
      s.inflow += 1;

      if (rawCsat !== undefined && rawCsat !== null && rawCsat !== "") {
        s.sumaCsat += valorCsat;
        s.countCsat += 1;
      }

      if (rawFrt !== undefined && rawFrt !== null && rawFrt !== "") {
        s.sumaFrt += valorFrt;
        s.countFrt += 1;
      }

      if (rawRes !== undefined && rawRes !== null && rawRes !== "") {
        s.sumaRes += valorRes;
        s.countRes += 1;
      }
    });

    const finalData = Object.values(agentStats).map(s => ({
      name: s.name,
      inflow: s.inflow,
      satisfaccion: s.countCsat > 0 ? (s.sumaCsat / s.countCsat).toFixed(2) : "0.00",
      primeraRespuesta: s.countFrt > 0 ? (s.sumaFrt / s.countFrt).toFixed(2) + " min" : "0.00 min",
      resolutionTime: s.countRes > 0 ? (s.sumaRes / s.countRes).toFixed(2) + " min" : "0.00 min"
    }));

    setDataByAgentConnect(finalData);
  };

  // ESTILOS
  const sectionTitleStyle = {
    color: "#1e3a8a", fontSize: "20px", fontWeight: "bold",
    marginTop: "30px", marginBottom: "15px", borderBottom: "3px solid #1e3a8a", paddingBottom: "8px"
  };

  const tableStyle = {
    width: "100%", borderCollapse: "collapse", marginBottom: "30px",
    background: "white", borderRadius: "8px", overflow: "hidden", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
  };

  const thStyle = { backgroundColor: "#1e3a8a", color: "white", padding: "12px 15px", textAlign: "left", fontSize: "14px" };
  const tdStyle = { padding: "10px 15px", borderBottom: "1px solid #e2e8f0", fontSize: "13px", color: "#334155" };

  if (loading) return <div style={{ padding: "50px" }}>Cargando métricas de Jira y Connect...</div>;

  return (
    <div style={{ padding: "30px", fontFamily: "sans-serif", background: "#f1f5f9", minHeight: "100vh" }}>
      <header style={{ marginBottom: "20px" }}>
        <h1 style={{ color: "#1e3a8a", margin: 0 }}>📊 Dashboard de Métricas Integradas</h1>
        <p style={{ color: "#64748b" }}>Semana actual: {currentWeek}</p>
      </header>

      {/* SECCIÓN JIRA */}
      <section>
        <h2 style={sectionTitleStyle}>Jira</h2>
        <h3 style={{ color: "#1e40af", borderLeft: "4px solid #1e40af", paddingLeft: "10px" }}>Resumen Operativo (Mediana de Tiempos)</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Persona Asignada</th>
              <th style={thStyle}>% de Escalados</th>
              <th style={thStyle}>% Declinados</th>
              <th style={thStyle}>Inicio de gestión</th>
              <th style={thStyle}>Mediana Tiempo Abierto (Sin Escalar)</th>
              <th style={thStyle}>Mediana Tiempo Abierto (Escalado)</th>
            </tr>
          </thead>
          <tbody>
            {dataByAgentJira.map((agent, i) => (
              <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                <td style={{ ...tdStyle, fontWeight: "bold" }}>{agent.name}</td>
                <td style={tdStyle}>{agent.porcentajeEscalados}</td>
                <td style={tdStyle}>{agent.porcentajeDeclinados}</td>
                <td style={tdStyle}>{agent.inicioGestionMin}</td>
                <td style={tdStyle}>{agent.resTimeSinEscalarMediana}</td>
                <td style={tdStyle}>{agent.resTimeEscaladoMediana}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ color: "#1e40af", borderLeft: "4px solid #1e40af", paddingLeft: "10px" }}>Métricas de Satisfacción (Solo Finalizadas)</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Persona Asignada</th>
              <th style={thStyle}>CSAT (Promedio)</th>
              <th style={thStyle}>DSAT (%)</th>
              <th style={thStyle}>Answer Rate</th>
            </tr>
          </thead>
          <tbody>
            {dataByAgentJira.map((agent, i) => (
              <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                <td style={{ ...tdStyle, fontWeight: "bold" }}>{agent.name}</td>
                <td style={tdStyle}>{agent.csat}</td>
                <td style={tdStyle}>{agent.dsat}</td>
                <td style={tdStyle}>{agent.answerRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* SECCIÓN CONNECT */}
      <section>
        <h2 style={sectionTitleStyle}>Connect</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Agente (FRT_BY)</th>
              <th style={thStyle}>INFLOW</th>
              <th style={thStyle}>SATISFACCIÓN</th>
              <th style={thStyle}>PRIMERA RESPUESTA</th>
              <th style={thStyle}>RESOLUTION TIME</th>
            </tr>
          </thead>
          <tbody>
            {dataByAgentConnect.map((agent, i) => (
              <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                <td style={{ ...tdStyle, fontWeight: "bold" }}>{agent.name}</td>
                <td style={tdStyle}>{agent.inflow}</td>
                <td style={tdStyle}>{agent.satisfaccion}</td>
                <td style={tdStyle}>{agent.primeraRespuesta}</td>
                <td style={tdStyle}>{agent.resolutionTime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default App;