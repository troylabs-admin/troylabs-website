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
  Product: { bg: "#9B59B6", text: "#FFFFFF" }, // Soft violet
  Alumni: { bg: "#F1C40F", text: "#FFFFFF" }     // Soft yellow
};


const Badge = ({ text, isSelected }) => {
  const color = teamColors[text] || { bg: "#F19E18", text: "#FFFFFF" };
  return (
    <span
      className="px-3 py-1 rounded-full text-xs font-medium"
      style={{
        backgroundColor: isSelected ? color.bg : `${color.bg}`,
        color: isSelected ? color.text : "#FFFFFF",
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
      import(`../../assets/Headshots/BobChen.jpg`)
        .then((image) => setImageUrl(image.default))
        .catch(() => setImageUrl(null));
    } else if (member.name === "Nolan Chen") {
      import(`../../assets/Headshots/NolanChen.jpeg`)
      .then((image) => setImageUrl(image.default))
      .catch(() => setImageUrl(null));
    } else if (member.name === "Jeffrey Yang") {
      import(`../../assets/Headshots/JeffreyYang.jpeg`)
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
      className="flex flex-col items-center p-3 rounded-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Member Image */}
      {imageUrl ? (
        <img src={imageUrl} alt={member.name} className="w-60 h-60 rounded-lg object-cover" />
      ) : (
        <div className="w-40 h-40 rounded-lg bg-gray-200 flex items-center justify-center text-3xl font-bold text-gray-500">
          {member.name.charAt(0)}
        </div>
      )}
  
      {/* Member Details */}
      <div className="text-center mt-2">
        <h3 className="text-lg font-medium">{member.name}</h3>
        <p className="text-gray-600 text-sm">{member.role}</p>
        <p className="text-gray-500 text-xs">Class of {member.year}</p>
      </div>
  
      {/* Role Badges */}
      <div className="flex flex-wrap justify-center gap-2 mt-1">
        <Badge text={member.position} color="bg-[#F19E18] text-white" />
        {member.role !== "Member" && !member.role.includes("Former") && (
          <Badge text="Board" color="bg-[#F19E18] text-white" />
        )}
      </div>
  
      {/* Hoverable Social Icons */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex space-x-3 mt-2"
          >
            {member.linkedin && (
              <a
                href={member.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 transition-colors"
              >
                <FaLinkedin size={25} />
              </a>
            )}
            {member.website && (
              <a
                href={member.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#F19E18] hover:text-[#E62314] transition-colors"
              >
                <FaGlobe size={18} />
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
    return teams
      .filter((member) => {
        const isBoardMember = member.role !== "Member" && !member.role.includes("Former");
        const isPresident = member.role === "President";
  
        // Ensure the member matches ALL selected labels, not just one
        const matchesAllSelectedTeams =
          selectedTeams.length === 0 || selectedTeams.every((team) => {
            return (
              (team === "Board" && isBoardMember) || // Match Board if selected
              (team === member.position) // Match position if selected
            );
          });
  
        // Ensure search term matches either name or role
        const matchesSearchTerm =
          member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          member.role.toLowerCase().includes(searchTerm.toLowerCase());
  
        return matchesSearchTerm && matchesAllSelectedTeams;
      })
      .sort((a, b) => {
        // Sort Presidents first
        if (a.role === "President" && b.role !== "President") return -1;
        if (b.role === "President" && a.role !== "President") return 1;
  
        // Sort Board Members next
        const isABoard = a.role !== "Member" && !a.role.includes("Former");
        const isBBoard = b.role !== "Member" && !b.role.includes("Former");
  
        if (isABoard && !isBBoard) return -1;
        if (!isABoard && isBBoard) return 1;
  
        // Sort alphabetically otherwise
        return a.name.localeCompare(b.name);
      });
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
