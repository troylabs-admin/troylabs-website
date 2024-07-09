import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaLinkedin, FaGlobe, FaSearch } from "react-icons/fa";
import teamMembers from "./TeamData.json";

const teamColors = {
  Board: { bg: "#8E44AD", text: "#FFFFFF" },     // Soft purple
  Marketing: { bg: "#E74C3C", text: "#FFFFFF" }, // Soft red
  Engineering: { bg: "#3498DB", text: "#FFFFFF" }, // Soft blue
  DEMO: { bg: "#27AE60", text: "#FFFFFF" },      // Soft green
  Finance: { bg: "#16A085", text: "#FFFFFF" },   // Soft teal
  Design: { bg: "#F39C12", text: "#FFFFFF" },    // Soft orange
  "Product Manager": { bg: "#9B59B6", text: "#FFFFFF" }, // Soft violet
  Alumni: { bg: "#F1C40F", text: "#FFFFFF" }     // Soft yellow
};


const Badge = ({ text, isSelected }) => {
  const color = teamColors[text] || { bg: "#F19E18", text: "#FFFFFF" };
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${
        isSelected ? `bg-${color.bg} text-${color.text}` : 'text-white'
      }`}
      style={{ 
        backgroundColor: isSelected ? color.bg : `${color.bg}`,
      }}
    >
      {text}
    </span>
  );
};

const TeamMemberCard = ({ member }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    const lastName = member.name.split(" ").pop();
    if (member.name === "Bob Chen") {
      import(`../../assets/Headshots/BobChen.jpeg`)
        .then((image) => setImageUrl(image.default))
        .catch(() => setImageUrl(null));
    } else {
      import(`../../assets/Headshots/${lastName}.jpeg`)
        .then((image) => setImageUrl(image.default))
        .catch(() => setImageUrl(null));
    }
  }, [member.name]);

  return (
    <motion.div
      layout
      className="flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={member.name}
          className="w-full rounded-lg h-96 object-cover"
        />
      ) : (
        <div className="w-full rounded-lg h-96 bg-gray-200 flex items-center justify-center text-4xl font-bold text-gray-500">
          {member.name.charAt(0)}
        </div>
      )}
      <div className="py-4">
        <div className="w-full flex flex-row mb-2 items-center justify-between">
          <h3 className="text-xl font-medium">{member.name}</h3>
          <div className="flex items-center gap-2">
            <Badge text={member.position} color="bg-[#F19E18] text-white" />
            {member.role !== "Member" && !member.role.includes("Former") && (
              <Badge text="Board" color="bg-[#F19E18] text-white" />
            )}
          </div>
        </div>
        <p className="text-gray-600 font-extralight mb-2">{member.role}</p>
        <p className="text-sm text-gray-500">Class of {member.year}</p>
      </div>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex space-x-4"
          >
            {member.linkedin && (
              <a
                href={member.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 transition-colors"
              >
                <FaLinkedin size={24} />
              </a>
            )}
            {member.website && (
              <a
                href={member.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#F19E18] hover:text-[#E62314] transition-colors"
              >
                <FaGlobe size={24} />
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const TeamDatabase = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeams, setSelectedTeams] = useState([]);
  const teams = teamMembers.members || [];

  const filteredMembers = useMemo(() => {
    const filtered = teams.filter((member) => {
      const isBoardMember =
        member.role !== "Member" && !member.role.includes("Former");
      const matchesTeam =
        selectedTeams.length === 0 ||
        selectedTeams.includes(member.position) ||
        (selectedTeams.includes("Board") && isBoardMember);
      const matchesSearchTerm =
        member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.role.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearchTerm && matchesTeam;
    });

    const boardMembers = filtered.filter(
      (member) => member.role !== "Member" && !member.role.includes("Former")
    );
    const otherMembers = filtered.filter(
      (member) => member.role === "Member" || member.role.includes("Former")
    );

    otherMembers.sort((a, b) => a.name.localeCompare(b.name));

    return [...boardMembers, ...otherMembers];
  }, [searchTerm, selectedTeams, teams]);

  console.log("filteredMembers", filteredMembers);

  const handleTeamToggle = useCallback((team) => {
    setSelectedTeams((prev) =>
      prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]
    );
  }, []);

  return (
    <div className="min-h-screen w-full py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <h1 className="text-5xl font-bold mb-12 text-center text-gray-800">
          Our Team
        </h1>
        <div className="mb-6">
          <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-300 p-4 max-w-2xl mx-auto">
            <FaSearch className="text-gray-400 mr-3" size={20} />
            <input
              type="text"
              placeholder="Search by name or role..."
              className="w-full outline-none text-lg text-gray-700 font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="mb-12 flex flex-wrap justify-center gap-3">
          {Object.keys(teamColors).map((team) => (
            <motion.button
              key={team}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors`}
              style={{
                backgroundColor: selectedTeams.includes(team) ? teamColors[team].bg : '',
                color: selectedTeams.includes(team) ? teamColors[team].text : '#4A5568',
              }}
              onClick={() => handleTeamToggle(team)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {team}
            </motion.button>
          ))}
        </div>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {filteredMembers.map((member) => (
            <TeamMemberCard key={member.name} member={member} selectedTeams={selectedTeams} />
          ))}
        </motion.div>
        {filteredMembers.length === 0 && (
          <p className="text-center text-gray-600 mt-10">
            No team members found matching your criteria.
          </p>
        )}
      </div>
    </div>
  );
};

export default TeamDatabase;
