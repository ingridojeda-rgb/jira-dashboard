import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

function App() {
  const [dataByAgent, setDataByAgent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState("");

  const archivos = ["/Week 1.6.xlsx"];

  useEffect(() => {
    const cargarUltimaSemana = async () => {
      try {
        const ultimaRuta = archivos[archivos.length - 1];
        setCurrentWeek(ultimaRuta.replace("/", "").replace(".xlsx", ""));
        
        const response = await fetch(`${ultimaRuta}?v=${new Date().getTime()}`);
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
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 
      ? sorted[mid] 
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const procesarDatos = (jsonData) => {
    const agentStats = {};

    jsonData.forEach(row => {
      const agent = row["Persona asignada"] || "Sin asignar";
      const estado = (row["Estado"] || "").toString().trim();
      const esEscalado = row["SD - Escalado"] && row["SD - Escalado"].toString().trim() !== "";
      
      const tiempoAbierto = parseFloat(row["Mediana tiempo abierto (hrs)"]) || 0;
      const rawSatisfaction = row["Satisfaction"];
      const tieneSatisfaction = rawSatisfaction !== undefined && rawSatisfaction !== null && rawSatisfaction !== "";
      const valorSatisfaction = parseFloat(rawSatisfaction);
      const frTimeMin = parseFloat(row["Time to first response"]) || 0;

      if (!agentStats[agent]) {
        agentStats[agent] = {
          name: agent,
          totalTickets: 0,
          escaladosCount: 0,
          declinadosCount: 0,
          frTimes: [],
          tiemposEscalados: [],
          tiemposNoEscalados: [],
          // Métricas de Satisfacción Unificadas
          sumaSatisfaccionFinalizada: 0,
          countFinalizadasConNota: 0,
          dsatBajos: 0,
          countFinalizadas: 0
        };
      }

      const s = agentStats[agent];
      s.totalTickets += 1;

      if (esEscalado) s.escaladosCount += 1;
      if (estado === "Declined") s.declinadosCount += 1;
      
      if (esEscalado) {
        s.tiemposEscalados.push(tiempoAbierto);
      } else {
        s.tiemposNoEscalados.push(tiempoAbierto);
      }

      if (frTimeMin > 0) s.frTimes.push(frTimeMin);

      // --- LÓGICA DE SATISFACCIÓN BLINDADA (Solo "Finalizada") ---
      if (estado === "Finalizada") {
        s.countFinalizadas += 1; // Base para Answer Rate

        if (tieneSatisfaction && !isNaN(valorSatisfaction)) {
          s.countFinalizadasConNota += 1; // Denominador común para CSAT y DSAT
          s.sumaSatisfaccionFinalizada += valorSatisfaction;

          // Si la nota es 1 o 2, se cuenta como DSAT
          if (valorSatisfaction === 1 || valorSatisfaction === 2) {
            s.dsatBajos += 1;
          }
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
        
        resTimeSinEscalarMediana: calcularMediana(s.tiemposNoEscalados).toFixed(2) + " h",
        resTimeEscaladoMediana: calcularMediana(s.tiemposEscalados).toFixed(2) + " h",
        
        // CSAT: Promedio solo de Finalizadas con nota
        csat: s.countFinalizadasConNota > 0 
          ? (s.sumaSatisfaccionFinalizada / s.countFinalizadasConNota).toFixed(2) 
          : "0.00",
          
        // DSAT: % de notas 1-2 sobre el mismo grupo de Finalizadas con nota
        dsat: s.countFinalizadasConNota > 0 
          ? ((s.dsatBajos / s.countFinalizadasConNota) * 100).toFixed(2) + "%" 
          : "0%",
          
        // Answer Rate: % de tickets cerrados que fueron calificados
        answerRate: s.countFinalizadas > 0 
          ? ((s.countFinalizadasConNota / s.countFinalizadas) * 100).toFixed(2) + "%" 
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
  const thStyle = { backgroundColor: "#1e3a8a", color: "white", padding: "12px 15px", textAlign: "left", fontSize: "14px" };
  const tdStyle = { padding: "10px 15px", borderBottom: "1px solid #e2e8f0", fontSize: "13px", color: "#334155" };

  if (loading) return <div style={{ padding: "50px" }}>Cargando métricas unificadas...</div>;

  return (
    <div style={{ padding: "30px", fontFamily: "sans-serif", background: "#f1f5f9", minHeight: "100vh" }}>
      <header style={{ marginBottom: "30px" }}>
        <h1 style={{ color: "#1e3a8a", margin: 0 }}>📊 Dashboard de Métricas Jira</h1>
        <p style={{ color: "#64748b" }}>Semana actual: {currentWeek}</p>
      </header>

      <section>
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