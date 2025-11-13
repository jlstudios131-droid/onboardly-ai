// /src/pages/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const Dashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: employeesData, error: empError } = await supabase
          .from("employees")
          .select("*");
        if (empError) throw empError;

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

    fetchData();
  }, []);

  if (loading)
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
      <h1 className="text-3xl font-bold mb-6 text-center">
        Onboardly AI Dashboard
      </h1>

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
