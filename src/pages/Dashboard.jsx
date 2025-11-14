// /src/pages/Dashboard.jsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import {
  FiSun,
  FiMoon,
  FiLogOut,
  FiUsers,
  FiDatabase,
  FiRefreshCw,
} from "react-icons/fi";

export default function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [apps, setApps] = useState([]);
  const [activity, setActivity] = useState([]);

  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");

  /** THEME HANDLER */
  useEffect(() => {
    const root = document.documentElement;
    theme === "dark" ? root.classList.add("dark") : root.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  /** INITIAL FETCH */
  useEffect(() => {
    const fetchData = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return navigate("/login");
      setUser(auth.user);

      const [{ data: emp }, { data: app }, { data: act }] = await Promise.all([
        supabase.from("employees").select("*").order("created_at", { ascending: false }),
        supabase.from("apps").select("*").order("created_at", { ascending: false }),
        supabase.from("activity_logs").select("*").order("created_at", { ascending: false })
      ]);

      setEmployees(emp || []);
      setApps(app || []);
      setActivity(act || []);
      setLoading(false);
    };

    fetchData();
  }, []);

  /** REALTIME LISTENERS */
  useEffect(() => {
    const channel = supabase
      .channel("realtime-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, (p) => {
        setEmployees((prev) => [p.new, ...prev]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "apps" }, (p) => {
        setApps((prev) => [p.new, ...prev]);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  /** SIMPLE STATS */
  const stats = useMemo(() => ({
    employees: employees.length,
    apps: apps.length,
  }), [employees, apps]);

  /** SIMPLE CHART DATA */
  const chartData = employees.slice(0, 7).map((e, i) => ({
    day: `Day ${i + 1}`,
    total: i + 1,
  }));

  /** LOGOUT */
  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        Loading dashboard…
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-6">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Onboardly AI Dashboard</h1>

        <div className="flex items-center gap-3">
          <button onClick={() => window.location.reload()} className="p-2 bg-gray-700/30 rounded-lg">
            <FiRefreshCw />
          </button>

          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="p-2 bg-gray-700/30 rounded-lg">
            {theme === "dark" ? <FiSun /> : <FiMoon />}
          </button>

          <button onClick={logout} className="px-3 py-2 bg-red-600 rounded-lg flex items-center gap-2">
            <FiLogOut /> Logout
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat title="Employees" value={stats.employees} icon={<FiUsers />} />
        <Stat title="Apps" value={stats.apps} icon={<FiDatabase />} />
      </div>

      {/* CHART */}
      <div className="bg-gray-800 p-4 rounded-xl mb-6">
        <h3 className="text-sm text-gray-300 mb-2">Employee Growth (simple)</h3>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <XAxis dataKey="day" stroke="#ccc" />
              <YAxis stroke="#ccc" />
              <Tooltip />
              <Line type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* EMPLOYEES */}
        <Box title="Employees">
          {employees.map((e) => (
            <div key={e.id} className="p-3 bg-gray-700/20 rounded mb-2 flex justify-between">
              <span>{e.full_name || e.email}</span>
              <span className="text-gray-400 text-sm">
                {new Date(e.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
          {!employees.length && <p className="text-gray-400">No employees yet.</p>}
        </Box>

        {/* APPS */}
        <Box title="Apps">
          {apps.map((a) => (
            <div key={a.id} className="p-3 bg-gray-700/20 rounded mb-2">
              <div className="font-medium">{a.name}</div>
              <div className="text-gray-400 text-sm">{a.description}</div>
            </div>
          ))}
          {!apps.length && <p className="text-gray-400">No apps yet.</p>}
        </Box>

        {/* ACTIVITY */}
        <Box title="Recent Activity">
          {activity.map((a) => (
            <div key={a.id} className="p-2 bg-gray-700/20 rounded mb-2 text-sm">
              {a.message || a.description}
              <div className="text-xs text-gray-400">
                {new Date(a.created_at).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {!activity.length && <p className="text-gray-400">No activity yet.</p>}
        </Box>
      </div>
    </div>
  );
}

/** SMALL COMPONENTS */
const Stat = ({ title, value, icon }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-gray-800 rounded-xl">
    <div className="text-gray-400 text-sm">{title}</div>
    <div className="text-2xl font-bold flex items-center gap-2">{value} {icon}</div>
  </motion.div>
);

const Box = ({ title, children }) => (
  <div className="bg-gray-800 p-4 rounded-xl">
    <h3 className="text-lg font-semibold mb-3">{title}</h3>
    {children}
  </div>
);
