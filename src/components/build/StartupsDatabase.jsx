import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaGlobe, FaSearch } from "react-icons/fa";
import startupData from "./StartupData.json";

const categoryColors = {
  Commerce: { bg: "#3498DB", text: "#FFFFFF" },
  Social: { bg: "#E74C3C", text: "#FFFFFF" },
  B2B: { bg: "#27AE60", text: "#FFFFFF" },
  Media: { bg: "#F39C12", text: "#FFFFFF" },
  Healthcare: { bg: "#8E44AD", text: "#FFFFFF" },
  Sustainability: { bg: "#16A085", text: "#FFFFFF" },
  "Health & Wellness": { bg: "#9B59B6", text: "#FFFFFF" },
  Tech: { bg: "#34495E", text: "#FFFFFF" },
  "Food & Beverage": { bg: "#D35400", text: "#FFFFFF" },
};

const Badge = ({ text, isSelected }) => {
  const color = categoryColors[text] || { bg: "#F19E18", text: "#FFFFFF" };
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${
        isSelected ? `bg-${color.bg} text-${color.text}` : "text-white"
      }`}
      style={{
        backgroundColor: isSelected ? color.bg : `${color.bg}`,
      }}
    >
      {text}
    </span>
  );
};

const StartupCard = ({ startup }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    const logoFileName = startup.name.replace(/\s+/g, "");
    const formats = ["png", "jpeg", "webp", "svg", "avif"];

    const tryLoadImage = (index) => {
      if (index >= formats.length) {
        setLogoUrl(null);
        return;
      }

      import(`../../assets/Startups/${logoFileName}.${formats[index]}`)
        .then((image) => setLogoUrl(image.default))
        .catch(() => tryLoadImage(index + 1));
    };

    tryLoadImage(0);
  }, [startup.name]);

  return (
    <motion.div
      layout
      className="flex flex-col w-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center bg-white rounded-lg justify-center p-6 w-full h-52 border border-gray-300 shadow-sm">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={startup.name}
            className="w-full rounded-lg h-full  object-contain overflow-hidden bg-white"
          />
        ) : (
          <div className="w-full rounded-lg h-full  bg-gray-200 overflow-hidden flex items-center justify-center text-4xl font-bold text-gray-500">
            {startup.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="py-4">
        <div className="w-full flex flex-row mb-2 items-center justify-between">
          <h3 className="text-xl font-medium">{startup.name}</h3>
          <Badge text={startup.category} />
        </div>
        <p className="text-gray-600 font-extralight mb-2">
          Cohort: {startup.cohort}
        </p>
      </div>

      <AnimatePresence>
        {isHovered && startup.website && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex space-x-4"
          >
            <a
              href={startup.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#F19E18] hover:text-[#E62314] transition-colors"
            >
              <FaGlobe size={24} />
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const StartupDatabase = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const startups = useMemo(() => {
    const sortedStartups = [...startupData.startups].sort((a, b) => {
      const cohortOrder = { S: 1, F: 0 };
      const [aYear, aSemester] = a.cohort.match(/(\d+)(\w)/).slice(1);
      const [bYear, bSemester] = b.cohort.match(/(\d+)(\w)/).slice(1);

      if (aYear !== bYear) return parseInt(bYear) - parseInt(aYear);
      return cohortOrder[bSemester] - cohortOrder[aSemester];
    });
    return sortedStartups.reverse();
  }, []);

  const filteredStartups = useMemo(() => {
    return startups.filter((startup) => {
      const matchesCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(startup.category);
      const matchesSearchTerm =
        startup.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        startup.tags.some((tag) =>
          tag.toLowerCase().includes(searchTerm.toLowerCase())
        );
      return matchesSearchTerm && matchesCategory;
    });
  }, [searchTerm, selectedCategories, startups]);

  const handleCategoryToggle = useCallback((category) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  }, []);

  const categories = [...new Set(startups.map((startup) => startup.category))];

  return (
    <div className="min-h-screen w-full py-16">
      <div className="container mx-auto px-4">
        <h1 className="text-5xl font-bold mb-12 text-center text-gray-800">
          Previous Startups
        </h1>
        <div className="mb-6">
          <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-300 p-4 max-w-2xl mx-auto">
            <FaSearch className="text-gray-400 mr-3" size={20} />
            <input
              type="text"
              placeholder="Search by name or tags..."
              className="w-full outline-none text-lg text-gray-700 font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="mb-12 flex flex-wrap justify-center gap-3">
          {categories.map((category) => (
            <motion.button
              key={category}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors`}
              style={{
                backgroundColor: selectedCategories.includes(category)
                  ? categoryColors[category].bg
                  : "",
                color: selectedCategories.includes(category)
                  ? categoryColors[category].text
                  : "#4A5568",
              }}
              onClick={() => handleCategoryToggle(category)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {category}
            </motion.button>
          ))}
        </div>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {filteredStartups.map((startup) => (
            <StartupCard key={startup.name} startup={startup} />
          ))}
        </motion.div>
        {filteredStartups.length === 0 && (
          <p className="text-center text-gray-600 mt-10">
            No startups found matching your criteria.
          </p>
        )}
      </div>
    </div>
  );
};

export default StartupDatabase;
