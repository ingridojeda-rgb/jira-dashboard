import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, ResponsiveContainer
} from "recharts";

function App() {
  const [metrics, setMetrics] = useState({});
  const [byPerson, setByPerson] = useState([]);
  const [pieData, setPieData] = useState([]);
  const [firstResponseByAgent, setFirstResponseByAgent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState("");

  const archivos = [
    "/Week 13.4.xlsx" 
  ];

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

  const procesarDatos = (jsonData) => {
    const total = jsonData.length;
    const agentStats = {};

    // Función auxiliar para limpiar y convertir tiempos (Horas/Minutos/Negativos)
    const limpiarTiempo = (valor) => {
      if (valor === undefined || valor === null || valor === "") return 0;
      let texto = valor.toString().toLowerCase().trim();
      let numeroBase = parseFloat(texto.replace(/[^\d.-]/g, ''));

      if (isNaN(numeroBase)) return 0;
      if (numeroBase < 0) return 1; // Regla: negativo se vuelve 1 positivo
      if (texto.includes('m')) return numeroBase / 60; // Regla: minutos a horas
      return numeroBase;
    };

    jsonData.forEach(row => {
      const person = row["Persona asignada"] || "Sin asignar";
      const resTime = limpiarTiempo(row["Time to resolution"]);
      const frTime = limpiarTiempo(row["Time to first response"]);
      const estaEscalado = row["SD-Escalado"] && row["SD-Escalado"].toString().trim() !== "";

      if (!agentStats[person]) {
        agentStats[person] = { 
          name: person, 
          escTotal: 0, escCount: 0,
          noEscTotal: 0, noEscCount: 0,
          frTotal: 0, frCount: 0
        };
      }

      if (estaEscalado) {
        agentStats[person].escTotal += resTime;
        agentStats[person].escCount += 1;
      } else {
        agentStats[person].noEscTotal += resTime;
        agentStats[person].noEscCount += 1;
      }

      agentStats[person].frTotal += frTime;
      agentStats[person].frCount += 1;
    });

    const resolutionData = Object.keys(agentStats).map(person => ({
      name: person,
      "T. Escalado": agentStats[person].escCount > 0 ? parseFloat((agentStats[person].escTotal / agentStats[person].escCount).toFixed(2)) : 0,
      "T. No Escalado": agentStats[person].noEscCount > 0 ? parseFloat((agentStats[person].noEscTotal / agentStats[person].noEscCount).toFixed(2)) : 0
    }));

    const responseData = Object.keys(agentStats).map(person => ({
      name: person,
      "Promedio 1ra Resp": agentStats[person].frCount > 0 ? parseFloat((agentStats[person].frTotal / agentStats[person].frCount).toFixed(2)) : 0
    }));

    const buckets = { "0-24h": 0, "24-48h": 0, "48h+": 0 };
    jsonData.forEach(row => {
      const t = limpiarTiempo(row["Time to resolution"]);
      if (t <= 24) buckets["0-24h"]++;
      else if (t <= 48) buckets["24-48h"]++;
      else buckets["48h+"]++;
    });

    // Promedios generales para las tarjetas
    const avgRes = resolutionData.length > 0 
      ? resolutionData.reduce((acc, curr) => acc + (curr["T. Escalado"] + curr["T. No Escalado"]), 0) / resolutionData.length 
      : 0;
    const avgFirst = responseData.length > 0 
      ? responseData.reduce((acc, curr) => acc + curr["Promedio 1ra Resp"], 0) / responseData.length 
      : 0;

    setMetrics({ tickets: total, avgRes, avgFirst });
    setByPerson(resolutionData);
    setFirstResponseByAgent(responseData);
    setPieData(Object.keys(buckets).map(name => ({ name, value: buckets[name] })));
  };

  const cardStyle = {
    background: "white", padding: "20px", borderRadius: "16px",
    boxShadow: "0 8px 20px rgba(0,0,0,0.08)", flex: 1, textAlign: "center"
  };

  if (loading) return <div style={{ padding: "50px" }}>Cargando análisis por agente...</div>;

  return (
    <div style={{ padding: "30px", fontFamily: "sans-serif", background: "#f8fafc", minHeight: "100vh" }}>
      <h1 style={{ color: "#1e3a8a" }}>📊 Dashboard Jira: {currentWeek}</h1>

      <div style={{ display: "flex", gap: 20, marginBottom: 30 }}>
        <div style={cardStyle}><h4>📂 Tickets</h4><h2 style={{ color: "#2563eb" }}>{metrics.tickets}</h2></div>
        <div style={cardStyle}><h4>⏱️ Prom. Resolución</h4><h2 style={{ color: "#2563eb" }}>{metrics.avgRes?.toFixed(2)}h</h2></div>
        <div style={cardStyle}><h4>🚀 1ra Respuesta</h4><h2 style={{ color: "#2563eb" }}>{metrics.avgFirst?.toFixed(2)}h</h2></div>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "16px", marginBottom: "30px" }}>
        <h3>👥 Resolución Promedio por Persona: Escalado vs No Escalado</h3>
        <ResponsiveContainer width="100%" height={500}>
          <BarChart data={byPerson} margin={{ bottom: 120 }}> 
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-90} textAnchor="end" interval={0} height={120} tick={{ fontSize: 11 }} />
            <YAxis label={{ value: 'Horas', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend verticalAlign="top" height={36}/>
            <Bar dataKey="T. Escalado" fill="#f87171" radius={[4, 4, 0, 0]} />
            <Bar dataKey="T. No Escalado" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "16px", marginBottom: "30px" }}>
        <h3>🚀 Tiempo Promedio de Primera Respuesta por Agente</h3>
        <ResponsiveContainer width="100%" height={500}>
          <BarChart data={firstResponseByAgent} margin={{ bottom: 120 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-90} textAnchor="end" interval={0} height={120} tick={{ fontSize: 11 }} />
            <YAxis label={{ value: 'Horas', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Bar dataKey="Promedio 1ra Resp" fill="#34d399" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "16px", maxWidth: "500px", margin: "0 auto" }}>
        <h3>📊 Distribución de Resolución (Total)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} label>
              <Cell fill="#6366f1" />
              <Cell fill="#fbbf24" />
              <Cell fill="#34d399" />
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default App;