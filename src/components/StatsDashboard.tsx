import { motion } from "motion/react";
import { Link2, MousePointerClick, Award, Clock } from "lucide-react";
import { ShortUrl } from "../types";

interface StatsDashboardProps {
  urls: ShortUrl[];
}

export default function StatsDashboard({ urls }: StatsDashboardProps) {
  const totalUrls = urls.length;
  const totalClicks = urls.reduce((sum, u) => sum + (u.clicks || 0), 0);
  
  // Find highest clicked URL
  const topUrl = totalUrls > 0 
    ? [...urls].sort((a, b) => (b.clicks || 0) - (a.clicks || 0))[0] 
    : null;

  const stats = [
    {
      title: "Total Links",
      value: totalUrls,
      icon: Link2,
      color: "bg-indigo-50 text-indigo-700 border-indigo-100",
      description: "Short links created by this browser",
      delay: 0
    },
    {
      title: "All-Time Clicks",
      value: totalClicks,
      icon: MousePointerClick,
      color: "bg-violet-50 text-violet-700 border-violet-100",
      description: "Total dynamic redirection views",
      delay: 0.05
    },
    {
      title: "Top Link Alias",
      value: topUrl ? `/${topUrl.id}` : "N/A",
      icon: Award,
      color: "bg-slate-50 text-slate-700 border-slate-200",
      description: topUrl ? `${topUrl.clicks} views on ${topUrl.title}` : "Create links to see top alias",
      className: "col-span-1 sm:col-span-2 md:col-span-1",
      delay: 0.1
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 mb-8">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: stat.delay }}
            className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-start gap-4 ${stat.className || ""}`}
          >
            <div className={`p-3 rounded-xl border ${stat.color} shrink-0`}>
              <Icon className="w-5 h-5" />
            </div>

            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                {stat.title}
              </span>
              <h4 className="text-xl sm:text-2xl font-bold font-display text-gray-900 truncate">
                {stat.value}
              </h4>
              <p className="text-xs text-gray-500 mt-1 truncate">
                {stat.description}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
