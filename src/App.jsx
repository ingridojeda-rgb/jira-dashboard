import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

function App() {
  const [dataByAgent, setDataByAgent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState("");

  const archivos = ["Week18.5.xlsx"];

  useEffect(() => {
    const cargarUltimaSemana = async () => {
      try {
        const ultimaRuta = archivos[archivos.length - 1];
        setCurrentWeek(ultimaRuta.replace("/", "").replace(".xlsx", ""));
        const response = await fetch(ultimaRuta);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        procesarDatos(jsonData);
      } catch (error) {
        console.error("Error al cargar el archivo:", error);
      } finally {
        setLoading(false);
      }
    };
    cargarUltimaSemana();
  }, []);

  const calcularMediana = (arr) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 
      ? sorted[mid] 
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

const procesarDatos = (jsonData) => {
    const agentStats = {};

    const limpiarTiempo = (valor) => {
      if (valor === undefined || valor === null || valor === "") return 0;
      let texto = valor.toString().toLowerCase().trim();
      let numeroBase = parseFloat(texto.replace(/[^\d.-]/g, ''));
      if (isNaN(numeroBase)) return 0;
      if (numeroBase < 0) return 1; 
      return texto.includes('m') ? numeroBase : numeroBase * 60;
    };

    jsonData.forEach(row => {
      const agent = row["Persona asignada"] || "Sin asignar";
      const estado = (row["Estado"] || "").toString().trim();
      const esEscalado = row["SD - Escalado"] && row["SD - Escalado"].toString().trim() !== "";
      
      // Validación de Satisfaction: verificamos que sea un número válido
      const rawSatisfaction = row["Satisfaction"];
      const tieneSatisfaction = rawSatisfaction !== undefined && rawSatisfaction !== null && rawSatisfaction !== "";
      const valorSatisfaction = parseFloat(rawSatisfaction);
      
      const resTimeMin = limpiarTiempo(row["Time to resolution"]);
      const frTimeMin = limpiarTiempo(row["Time to first response"]);

      if (!agentStats[agent]) {
        agentStats[agent] = {
          name: agent,
          totalTickets: 0,
          escaladosCount: 0,
          declinadosCount: 0,
          frTimes: [],
          resTimesEsc: [],
          resTimesNoEsc: [],
          // Métricas de Satisfacción
          sumaSatisfaccion: 0,
          countSatisfaccion: 0, // Tickets que TIENEN satisfacción (para CSAT y DSAT)
          dsatBajos: 0,         // Tickets con 1 o 2
          countFinalizadas: 0   // Tickets con estado "Finalizada"
        };
      }

      const s = agentStats[agent];
      s.totalTickets += 1;

      // 1. % Escalados
      if (esEscalado) s.escaladosCount += 1;

      // 2. % Declinados
      if (estado === "Declined") s.declinadosCount += 1;

      // 3. Inicio de gestión
      if (frTimeMin > 0) s.frTimes.push(frTimeMin);

      // 4 y 5. Resolution Times
      if (esEscalado) {
        s.resTimesEsc.push(resTimeMin / 60); 
      } else {
        s.resTimesNoEsc.push(resTimeMin / 60);
      }

      // --- NUEVA LÓGICA DE SATISFACCIÓN ---

      // Contamos cuantas "Finalizada" hay (para Answer Rate)
      if (estado === "Finalizada") {
        s.countFinalizadas += 1;
      }

      // Si tiene el campo Satisfaction diligenciado
      if (tieneSatisfaction && !isNaN(valorSatisfaction)) {
        s.countSatisfaccion += 1; // Denominador para DSAT
        
        // Regla 1: CSAT (Solo si es "Finalizada" y tiene Satisfaction)
        if (estado === "Finalizada") {
          s.sumaSatisfaccion += valorSatisfaction;
        }

        // Regla 2: DSAT (Porcentaje de 1 y 2 sobre el total de Satisfaction diligenciados)
        if (valorSatisfaction === 1 || valorSatisfaction === 2) {
          s.dsatBajos += 1;
        }
      }
    });

    const finalData = Object.values(agentStats).map(s => {
      const avgFR = s.frTimes.length > 0 ? (s.frTimes.reduce((a,b) => a+b, 0) / s.frTimes.length) : 0;
      
      return {
        name: s.name,
        porcentajeEscalados: s.totalTickets > 0 ? ((s.escaladosCount / s.totalTickets) * 100).toFixed(2) + "%" : "0%",
        porcentajeDeclinados: s.totalTickets > 0 ? ((s.declinadosCount / s.totalTickets) * 100).toFixed(2) + "%" : "0%",
        inicioGestionMin: avgFR.toFixed(2) + " min",
        resTimeSinEscalarMediana: calcularMediana(s.resTimesNoEsc).toFixed(2) + " h",
        resTimeEscaladoMediana: calcularMediana(s.resTimesEsc).toFixed(2) + " h",
        
        // 1. CSAT: Promedio de satisfacción en Finalizadas
        csat: s.countFinalizadas > 0 && s.sumaSatisfaccion > 0 
          ? (s.sumaSatisfaccion / s.countSatisfaccion).toFixed(2) 
          : "0.00",
        
        // 2. DSAT: % de (1 y 2) sobre total de Satisfaction diligenciados
        dsat: s.countSatisfaccion > 0 
          ? ((s.dsatBajos / s.countSatisfaccion) * 100).toFixed(2) + "%" 
          : "0%",
        
        // 3. Answer Rate: % de Finalizadas que tienen Satisfaction
        // (Nota: un ticket puede tener satisfacción sin estar finalizado, pero aquí filtramos por la lógica solicitada)
        answerRate: s.countFinalizadas > 0 
          ? ((s.countSatisfaccion / s.countFinalizadas) * 100).toFixed(2) + "%" 
          : "0%"
      };
    });

    setDataByAgent(finalData);
  };

  const tableStyle = {
    width: "100%", borderCollapse: "collapse", marginBottom: "40px",
    background: "white", borderRadius: "8px", overflow: "hidden",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
  };

  const thStyle = {
    backgroundColor: "#1e3a8a", color: "white", padding: "12px 15px",
    textAlign: "left", fontSize: "14px"
  };

  const tdStyle = {
    padding: "10px 15px", borderBottom: "1px solid #e2e8f0",
    fontSize: "13px", color: "#334155"
  };

  if (loading) return <div style={{ padding: "50px" }}>Cargando análisis de datos...</div>;

  return (
    <div style={{ padding: "30px", fontFamily: "sans-serif", background: "#f1f5f9", minHeight: "100vh" }}>
      <header style={{ marginBottom: "30px" }}>
        <h1 style={{ color: "#1e3a8a", margin: 0 }}>📊 Dashboard de Métricas Jira</h1>
        <p style={{ color: "#64748b" }}>Semana actual: {currentWeek}</p>
      </header>

      <section>
        <h3 style={{ color: "#1e40af", borderLeft: "4px solid #1e40af", paddingLeft: "10px" }}>Resumen Operativo por Agente</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Persona Asignada</th>
              <th style={thStyle}>% de Escalados</th>
              <th style={thStyle}>% Declinados</th>
              <th style={thStyle}>Inicio de gestión</th>
              <th style={thStyle}>Resolution time sin escalar (Mediana)</th>
              <th style={thStyle}>Resolution time escalado (Mediana)</th>
            </tr>
          </thead>
          <tbody>
            {dataByAgent.map((agent, i) => (
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

        <h3 style={{ color: "#1e40af", borderLeft: "4px solid #1e40af", paddingLeft: "10px" }}>Métricas de Satisfacción</h3>
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
            {dataByAgent.map((agent, i) => (
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
    </div>
  );
}

export default App;