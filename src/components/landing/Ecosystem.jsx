import React from "react";
import { motion } from "framer-motion";
import { FaUsers, FaRocket, FaHandshake, FaArrowRight } from "react-icons/fa";
import EcosystemDesign from "./EcosystemDesign";
import { useNavigate } from "react-router-dom";

const outlineVariants = {
  initial: {
    opacity: 0,
    pathLength: 0,
  },
  animate: {
    opacity: 1,
    pathLength: 1,
    transition: {
      duration: 3,
      ease: "easeInOut",
      repeat: Infinity,
      repeatType: "reverse",
    },
  },
};
const EcosystemCard = ({
  icon: Icon,
  title,
  description,
  buttonText,
  delay,
  url,
  navigate
}) => {

  return (
    <motion.div
      className="bg-white bg-opacity-90 backdrop-filter backdrop-blur-lg rounded-xl overflow-hidden relative z-10"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <div className="p-6">
        <div className="w-16 h-16 bg-gradient-to-br from-[#F19E18] to-[#E62314] rounded-full flex items-center justify-center mb-6 shadow-lg relative">
          <Icon className="text-white text-3xl relative z-10" />
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
            <motion.circle
              cx="50"
              cy="50"
              r="48"
              stroke="white"
              strokeWidth="2"
              fill="none"
              variants={outlineVariants}
              initial="initial"
              animate="animate"
            />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-gray-800 mb-4">{title}</h3>
        <p className="text-gray-600 mb-6">{description}</p>
        <motion.button
          className="mt-auto inline-flex items-center px-4 py-2 border border-[#E62314] text-sm font-medium rounded-full text-[#E62314] hover:bg-[#E62314] hover:text-white transition-all duration-300"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            navigate(url);
          }}
        >
          {buttonText}
          <FaArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </motion.button>
      </div>
    </motion.div>
  );
};

function Ecosystem() {
  const navigate = useNavigate();
  const data = [
    {
      icon: FaUsers,
      title: "For Potential Members",
      description:
        "Join a community of innovators and leaders. Develop your skills, work on exciting projects, and shape the future of entrepreneurship at USC.",
      buttonText: "Join Us",
      url: "/team",
    },
    {
      icon: FaRocket,
      title: "For Startups",
      description:
        "Get the support you need to launch and grow your startup. Access mentorship, resources, and a network of fellow entrepreneurs to accelerate your success.",
      buttonText: "Apply Now",
      url: "/build",
    },
    {
      icon: FaHandshake,
      title: "For Partners",
      description:
        "Collaborate with TroyLabs to foster innovation and support the next generation of entrepreneurs. Make a lasting impact on the USC startup ecosystem.",
      buttonText: "Partner With Us",
      url: "/partners",
    },
  ];

  return (
    <div className="w-full py-16 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.h2
          className="text-xl text-gray-400 font-medium mb-4 uppercase tracking-wider"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Join Our Ecosystem
        </motion.h2>
        <motion.p
          className="text-4xl sm:text-5xl max-w-3xl leading-tight sm:leading-snug text-gray-800 font-bold mb-16"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Discover how you can be a part of TroyLabs' innovative community
        </motion.p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {data.map((item, index) => (
            <EcosystemCard navigate={navigate} key={index} {...item} delay={index * 0.2} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default Ecosystem;
