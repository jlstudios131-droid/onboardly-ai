// /src/pages/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchUserAndData = async () => {
      // Verificar usuário logado
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        navigate("/login");
        return;
      }
      setUser(userData.user);

      try {
        // Buscar Employees
        const { data: employeesData, error: empError } = await supabase
          .from("employees")
          .select("*");
        if (empError) throw empError;

        // Buscar Apps
        const { data: appsData, error: appsError } = await supabase
          .from("apps")
          .select("*");
        if (appsError) throw appsError;

        setEmployees(employeesData || []);
        setApps(appsData || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUserAndData();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (!user || loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <p>Loading...</p>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-red-400">
        <p>Error: {error}</p>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Onboardly AI Dashboard</h1>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-500 rounded-lg hover:bg-red-600"
        >
          Logout
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-gray-800 p-6 rounded-2xl shadow">
          <h2 className="text-xl font-semibold mb-4">Employees</h2>
          {employees.length > 0 ? (
            <ul className="space-y-2">
              {employees.map((emp) => (
                <li
                  key={emp.id}
                  className="bg-gray-700 p-3 rounded flex justify-between"
                >
                  <span>{emp.full_name || emp.email}</span>
                  <span className="text-gray-400 text-sm">
                    {new Date(emp.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400">No employees found.</p>
          )}
        </div>

        <div className="bg-gray-800 p-6 rounded-2xl shadow">
          <h2 className="text-xl font-semibold mb-4">Applications</h2>
          {apps.length > 0 ? (
            <ul className="space-y-2">
              {apps.map((app) => (
                <li key={app.id} className="bg-gray-700 p-3 rounded">
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 underline"
                  >
                    {app.name}
                  </a>
                  <p className="text-gray-400 text-sm">{app.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400">No applications found.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
