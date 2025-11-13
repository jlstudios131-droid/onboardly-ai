// /src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { FiSun, FiMoon, FiLogOut, FiRefreshCw, FiDownload, FiSettings, FiUsers, FiDatabase } from "react-icons/fi";

/**
 * Dashboard — enterprise-level, realtime, dark/light, charts, CSV export
 * - Realtime subscriptions for employees, apps, onboardings, activity_logs
 * - Theme toggle stored in localStorage
 * - Exports CSV for employees and onboardings
 *
 * Requirements:
 * - Tables: employees, apps, onboarding_templates, onboarding_steps, employee_onboardings, activity_logs
 * - Supabase keys set in env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
 */

function formatDateShort(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function csvFromArray(rows = []) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const lines = [keys.join(",")];
  for (const r of rows) {
    lines.push(
      keys
        .map((k) => {
          const val = r[k] == null ? "" : String(r[k]);
          // escape quotes
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
  }
  return lines.join("\n");
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);

  // data states
  const [employees, setEmployees] = useState([]);
  const [apps, setApps] = useState([]);
  const [onboardings, setOnboardings] = useState([]);
  const [activities, setActivities] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // theme
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem("onboardly_theme") || "dark";
  });

  // helper: apply theme class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("onboardly_theme", theme);
  }, [theme]);

  // fetch initial data (and check auth)
  useEffect(() => {
    let isMounted = true;

    const fetchAll = async () => {
      try {
        // verify logged user
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          navigate("/login");
          return;
        }
        if (!isMounted) return;
        setUser(userData.user);

        // fetch employees
        const { data: empData, error: empErr } = await supabase
          .from("employees")
          .select("*")
          .order("created_at", { ascending: false });
        if (empErr) throw empErr;

        // fetch apps
        const { data: appsData, error: appsErr } = await supabase
          .from("apps")
          .select("*")
          .order("created_at", { ascending: false });
        if (appsErr) throw appsErr;

        // fetch onboardings
        const { data: onboardData, error: onErr } = await supabase
          .from("employee_onboardings")
          .select("*")
          .order("started_at", { ascending: false });
        if (onErr) throw onErr;

        // fetch activities (recent)
        const { data: actData, error: actErr } = await supabase
          .from("activity_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (actErr && actErr.code !== "PGRST116") throw actErr; // if table missing ignore specific code

        if (!isMounted) return;

        setEmployees(empData || []);
        setApps(appsData || []);
        setOnboardings(onboardData || []);
        setActivities(actData || []);
        setError("");
      } catch (err) {
        console.error("Fetch error:", err);
        setError(err.message || "Failed to load data");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAll();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  // realtime subscriptions
  useEffect(() => {
    // Subscribe helper
    const channels = [];

    // employees
    const empChannel = supabase
      .channel("public:employees")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employees" },
        (payload) => {
          // payload: INSERT | UPDATE | DELETE
          const { eventType, new: newRow, old } = payload;
          // console.log("employees change: ", payload);
          setEmployees((prev) => {
            if (eventType === "INSERT") return [newRow, ...prev];
            if (eventType === "UPDATE")
              return prev.map((r) => (r.id === newRow.id ? newRow : r));
            if (eventType === "DELETE") return prev.filter((r) => r.id !== old.id);
            return prev;
          });
        }
      )
      .subscribe();

    channels.push(empChannel);

    // apps
    const appsChannel = supabase
      .channel("public:apps")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "apps" },
        (payload) => {
          const { eventType, new: newRow, old } = payload;
          setApps((prev) => {
            if (eventType === "INSERT") return [newRow, ...prev];
            if (eventType === "UPDATE") return prev.map((r) => (r.id === newRow.id ? newRow : r));
            if (eventType === "DELETE") return prev.filter((r) => r.id !== old.id);
            return prev;
          });
        }
      )
      .subscribe();

    channels.push(appsChannel);

    // onboardings
    const onboardChannel = supabase
      .channel("public:onboardings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_onboardings" },
        (payload) => {
          const { eventType, new: newRow, old } = payload;
          setOnboardings((prev) => {
            if (eventType === "INSERT") return [newRow, ...prev];
            if (eventType === "UPDATE") return prev.map((r) => (r.id === newRow.id ? newRow : r));
            if (eventType === "DELETE") return prev.filter((r) => r.id !== old.id);
            return prev;
          });

          // also create a readable activity entry
          if (payload.eventType === "UPDATE" && payload.new?.progress === 100) {
            setActivities((prev) => [
              {
                id: `act-${Date.now()}`,
                message: `Onboarding completed for employee_id ${payload.new.employee_id}`,
                created_at: new Date().toISOString(),
              },
              ...prev,
            ]);
          }
        }
      )
      .subscribe();

    channels.push(onboardChannel);

    // activity_logs
    const actChannel = supabase
      .channel("public:activity_logs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activity_logs" },
        (payload) => {
          const { eventType, new: newRow, old } = payload;
          setActivities((prev) => {
            if (eventType === "INSERT") return [newRow, ...prev].slice(0, 100);
            if (eventType === "DELETE") return prev.filter((r) => r.id !== old.id);
            if (eventType === "UPDATE") return prev.map((r) => (r.id === newRow.id ? newRow : r));
            return prev;
          });
        }
      )
      .subscribe();

    channels.push(actChannel);

    return () => {
      // unsubscribe all channels
      channels.forEach((ch) => {
        try {
          ch.unsubscribe().catch(() => {});
        } catch {}
      });
    };
  }, []);

  // derived stats
  const stats = useMemo(() => {
    const totalEmployees = employees.length;
    const totalApps = apps.length;
    const onboardingsInProgress = onboardings.filter((o) => !o.completed).length;
    const adoptionAvg =
      onboardings.length === 0
        ? 0
        : Math.round(onboardings.reduce((s, o) => s + (o.progress || 0), 0) / onboardings.length);

    // apps usage count (based on onboarding payload if exists) fallback to 0
    const appsUsage = apps.map((a) => {
      const count = onboardings.filter((o) => {
        // try match by template or payload referencing app id
        try {
          if (o.app_id) return o.app_id === a.id;
          if (o.payload && typeof o.payload === "object") {
            return o.payload.app_id === a.id;
          }
        } catch {}
        return false;
      }).length;
      return { ...a, count };
    });

    return { totalEmployees, totalApps, onboardingsInProgress, adoptionAvg, appsUsage };
  }, [employees, apps, onboardings]);

  // chart data: registrations last 7 days (employees created_at)
  const chartData = useMemo(() => {
    const days = 7;
    const map = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map[key] = { date: key, employees: 0, onboardings: 0 };
    }
    employees.forEach((e) => {
      if (!e.created_at) return;
      const key = e.created_at.slice(0, 10);
      if (map[key]) map[key].employees += 1;
    });
    onboardings.forEach((o) => {
      if (!o.started_at) return;
      const key = o.started_at.slice(0, 10);
      if (map[key]) map[key].onboardings += 1;
    });
    return Object.values(map);
  }, [employees, onboardings]);

  // CSV export handlers
  const handleExportEmployees = useCallback(() => {
    const rows = employees.map((e) => ({
      id: e.id,
      full_name: e.full_name || "",
      email: e.email || "",
      created_at: e.created_at || "",
    }));
    const csv = csvFromArray(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employees-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [employees]);

  const handleExportOnboardings = useCallback(() => {
    const rows = onboardings.map((o) => ({
      id: o.id,
      employee_id: o.employee_id,
      template_id: o.template_id,
      progress: o.progress,
      started_at: o.started_at,
      completed: o.completed,
    }));
    const csv = csvFromArray(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `onboardings-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [onboardings]);

  // refresh manual
  const handleRefresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [{ data: empData }, { data: appsData }, { data: onboardData }, { data: actData }] =
        await Promise.all([
          supabase.from("employees").select("*").order("created_at", { ascending: false }),
          supabase.from("apps").select("*").order("created_at", { ascending: false }),
          supabase.from("employee_onboardings").select("*").order("started_at", { ascending: false }),
          supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(100),
        ]);
      setEmployees(empData || []);
      setApps(appsData || []);
      setOnboardings(onboardData || []);
      setActivities(actData || []);
    } catch (err) {
      setError(err.message || "Refresh failed");
    } finally {
      setLoading(false);
    }
  };

  // logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // small helpers for UI
  const StatCard = ({ title, value, icon }) => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="bg-white/5 dark:bg-gray-800 p-4 rounded-xl shadow-sm flex items-center justify-between"
    >
      <div>
        <div className="text-sm text-gray-300">{title}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
      <div className="text-3xl text-indigo-400">{icon}</div>
    </motion.div>
  );

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <p>Loading dashboard...</p>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-red-400 p-6">
        <div>
          <h3 className="text-xl font-bold mb-2">Error</h3>
          <pre className="text-sm">{error}</pre>
          <button onClick={handleRefresh} className="mt-4 px-4 py-2 bg-indigo-600 rounded">
            Retry
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-3">
              <span>Onboardly AI</span>
              <span className="text-sm font-medium text-gray-400">Dashboard</span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Welcome back{user?.email ? `, ${user.email}` : ""} — live stats below.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              title="Refresh data"
              onClick={handleRefresh}
              className="p-2 rounded-lg bg-white/5 dark:bg-gray-800 hover:bg-white/10"
            >
              <FiRefreshCw />
            </button>

            <button
              title="Export employees CSV"
              onClick={handleExportEmployees}
              className="p-2 rounded-lg bg-white/5 dark:bg-gray-800 hover:bg-white/10"
            >
              <FiDownload />
            </button>

            <button
              title="Export onboardings CSV"
              onClick={handleExportOnboardings}
              className="p-2 rounded-lg bg-white/5 dark:bg-gray-800 hover:bg-white/10"
            >
              <FiDownload />
            </button>

            <button
              title="Toggle theme"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="p-2 rounded-lg bg-white/5 dark:bg-gray-800 hover:bg-white/10"
            >
              {theme === "dark" ? <FiSun /> : <FiMoon />}
            </button>

            <button
              title="Logout"
              onClick={handleLogout}
              className="ml-2 px-3 py-2 bg-red-600 text-white rounded-lg flex items-center gap-2"
            >
              <FiLogOut />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left column: stats + charts */}
          <div className="lg:col-span-3 space-y-6">
            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Employees" value={stats.totalEmployees} icon={<FiUsers />} />
              <StatCard title="Onboardings" value={stats.onboardingsInProgress} icon={<FiDatabase />} />
              <StatCard title="Apps" value={stats.totalApps} icon={<FiDatabase />} />
              <StatCard title="Avg Adoption" value={`${stats.adoptionAvg}%`} icon={"%"} />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 dark:bg-gray-800 p-4 rounded-xl"
              >
                <h3 className="text-sm text-gray-400 mb-2">Registrations & Onboardings (7 days)</h3>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                      <XAxis dataKey="date" tick={{ fill: theme === "dark" ? "#cbd5e1" : "#0f172a" }} />
                      <YAxis tick={{ fill: theme === "dark" ? "#cbd5e1" : "#0f172a" }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="employees" stroke="#7c3aed" strokeWidth={2} />
                      <Line type="monotone" dataKey="onboardings" stroke="#06b6d4" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 dark:bg-gray-800 p-4 rounded-xl"
              >
                <h3 className="text-sm text-gray-400 mb-2">Top Apps by Onboardings</h3>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={stats.appsUsage}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                      <XAxis dataKey="name" tick={{ fill: theme === "dark" ? "#cbd5e1" : "#0f172a" }} />
                      <YAxis tick={{ fill: theme === "dark" ? "#cbd5e1" : "#0f172a" }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f97316" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            </div>

            {/* Employees table */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 dark:bg-gray-800 p-4 rounded-xl"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Employees</h3>
                <div className="text-sm text-gray-400">{employees.length} total</div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="text-left text-sm text-gray-400">
                      <th className="p-2">Name</th>
                      <th className="p-2 hidden md:table-cell">Email</th>
                      <th className="p-2">Progress</th>
                      <th className="p-2">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => {
                      // find onboarding progress
                      const ob = onboardings.find((o) => o.employee_id === emp.id);
                      const progress = ob ? ob.progress || 0 : 0;
                      return (
                        <tr key={emp.id} className="border-t">
                          <td className="p-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center text-white font-bold">
                                {emp.full_name ? emp.full_name[0] : (emp.email || "U")[0]}
                              </div>
                              <div>
                                <div className="font-medium">{emp.full_name || "—"}</div>
                                <div className="text-xs text-gray-400 md:hidden">{emp.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-2 hidden md:table-cell text-sm text-gray-300">{emp.email}</td>
                          <td className="p-2 w-40">
                            <div className="w-full bg-gray-700 h-2 rounded">
                              <div
                                className="h-2 rounded bg-gradient-to-r from-green-400 to-blue-500"
                                style={{ width: `${Math.min(100, progress)}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-400 mt-1">{progress}%</div>
                          </td>
                          <td className="p-2 text-sm text-gray-400">{formatDateShort(emp.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>

          {/* Right column: apps, activities, insights */}
          <aside className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 dark:bg-gray-800 p-4 rounded-xl"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Apps</h3>
                <span className="text-sm text-gray-400">{apps.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {apps.map((a) => (
                  <div key={a.id} className="p-3 bg-gray-900/10 dark:bg-gray-700 rounded flex items-center justify-between">
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-gray-400">{a.description}</div>
                    </div>
                    <div className="text-sm text-gray-300">{/* usage count if available */}</div>
                  </div>
                ))}
                {apps.length === 0 && <div className="text-gray-400 text-sm">No apps connected.</div>}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 dark:bg-gray-800 p-4 rounded-xl"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Activity Feed</h3>
                <div className="text-sm text-gray-400">{activities.length}</div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activities.map((act) => (
                  <div key={act.id || act.created_at} className="p-2 rounded bg-gray-900/10 dark:bg-gray-700/50 text-sm">
                    <div className="text-gray-200">{act.message || act.description || "Activity"}</div>
                    <div className="text-xs text-gray-400 mt-1">{formatDateShort(act.created_at)}</div>
                  </div>
                ))}
                {activities.length === 0 && <div className="text-gray-400">No recent activities.</div>}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 dark:bg-gray-800 p-4 rounded-xl"
            >
              <h3 className="text-lg font-semibold mb-2">Insights</h3>
              <div className="text-sm text-gray-400 space-y-2">
                <p>
                  Average adoption across onboardings: <strong>{stats.adoptionAvg}%</strong>
                </p>
                <p>
                  Onboardings in progress: <strong>{stats.onboardingsInProgress}</strong>
                </p>
                <p>
                  Top app:{" "}
                  <strong>
                    {stats.appsUsage && stats.appsUsage.length ? stats.appsUsage.sort((a,b)=>b.count-a.count)[0]?.name || "—" : "—"}
                  </strong>
                </p>
                <div className="pt-3">
                  <small className="text-xs text-gray-500">Insights generated from live data.</small>
                </div>
              </div>
            </motion.div>
          </aside>
        </div>
      </div>
    </div>
  );
                }
      
            
                        
