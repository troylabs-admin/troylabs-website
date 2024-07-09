import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const FounderCard = ({ name, role, company, image, tags }) => (
  <motion.div
    className="bg-white rounded-lg shadow-md p-6 w-full"
    whileHover={{
      scale: 1.02,
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
    }}
  >
    <div className="flex items-center mb-4">
      <img
        src={image}
        alt={name}
        className="w-16 h-16 rounded-full object-cover mr-4"
      />
      <div>
        <h3 className="text-lg font-semibold">{name}</h3>
        <p className="text-sm text-gray-600">
          {role} at {company}
        </p>
      </div>
    </div>
    <div className="flex flex-wrap gap-2 mt-2">
      {tags.map((tag, index) => (
        <span
          key={index}
          className="px-2 py-1 bg-gray-100 text-xs rounded-full"
        >
          {tag}
        </span>
      ))}
    </div>
  </motion.div>
);

const FoundersSection = () => {

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All");

  const founders = [
    {
      name: "Nicholas Jimothy",
      role: "Co-Founder",
      company: "Ristle",
      image: "/api/placeholder/200/150",
      tags: ["AI", "FinTech"],
    },
    {
      name: "Cassandra Hand",
      role: "CEO",
      company: "EcoTech",
      image: "/api/placeholder/200/150",
      tags: ["CleanTech", "Sustainability"],
    },
    {
      name: "Alex Chen",
      role: "CTO",
      company: "HealthHub",
      image: "/api/placeholder/200/150",
      tags: ["HealthTech", "AI"],
    },
    {
      name: "Sophia Patel",
      role: "Co-Founder",
      company: "EduSpark",
      image: "/api/placeholder/200/150",
      tags: ["EdTech", "SaaS"],
    },
  ];

  const filteredFounders = founders.filter(
    (founder) =>
      (selectedFilter === "All" || founder.tags.includes(selectedFilter)) &&
      (founder.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        founder.company.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="w-full min-h-screen py-16">
      <div className="container mx-auto px-4">
        <div>
          <h2 className="text-4xl font-bold mb-8">
            Join our community of founders
          </h2>
          <div className="flex flex-wrap gap-4 mb-6">
            <input
              type="text"
              placeholder="Search founders or companies"
              className="flex-grow p-2 border rounded-md"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="p-2 border rounded-md"
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
            >
              <option value="All">All Industries</option>
              <option value="AI">AI</option>
              <option value="FinTech">FinTech</option>
              <option value="HealthTech">HealthTech</option>
              <option value="EdTech">EdTech</option>
              <option value="CleanTech">CleanTech</option>
            </select>
          </div>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <AnimatePresence>
              {filteredFounders.map((founder, index) => (
                <motion.div
                  key={founder.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  <FounderCard {...founder} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default FoundersSection;
