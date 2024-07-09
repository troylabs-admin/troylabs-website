import React from "react";
import { motion } from "framer-motion";
import { FaUsers, FaRocket, FaChartPie, FaArrowRight } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

function Initiatives() {
  const data = [
    {
      icon: FaUsers,
      title: "BUILD Accelerator",
      description:
        "8-week program for USC startups. Mentorship, resources, and consulting across tech, design, marketing, and finance.",
      buttonText: "Apply Now",
      url: "/build",
    },
    {
      icon: FaRocket,
      title: "IGNITE Community",
      description:
        "Grow entrepreneurial skills through fireside chats, workshops, and networking events with founders and investors.",
      buttonText: "Join IGNITE",
      url: "https://join.slack.com/t/ignite-troylabs/shared_invite/zt-2fjhwxjvb-s6mMKtJ1OI9bnbDFt1zfWw",
    },
    {
      icon: FaChartPie,
      title: "DEMO Exhibition",
      description:
        "USC's largest student-run entrepreneurship conference. 50+ startups, 1000+ attendees, pitch competitions, and workshops.",
      buttonText: "Learn More",
      url: "https://demo.troylabs.vc/",
    },
  ];

  const navigate = useNavigate();

  const containerVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        delayChildren: 0.3,
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
      },
    },
  };

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

  const handleNavigation = (url) => {
    if (url.startsWith("/")) {
      navigate(url);
    } else {
      window.open(url, "_blank");
    }
  };

  return (
    <motion.div
      className="w-full absolute top-[-5rem] overflow-visible"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          className="bg-white backdrop-filter backdrop-blur-xl rounded-2xl overflow-hidden
                     shadow-[0_0_20px_rgba(241,158,24,0.3),0_0_60px_rgba(230,35,20,0.3)]
                     border border-white border-opacity-30"
          variants={itemVariants}
        >
          <div className="p-8 sm:p-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {data.map((item, index) => (
                <motion.div
                  key={index}
                  className="flex flex-col items-start"
                  variants={itemVariants}
                >
                  <div className="w-16 h-16 bg-gradient-to-br from-[#F19E18] to-[#E62314] rounded-full flex items-center justify-center mb-6 shadow-lg relative">
                    <item.icon className="text-white text-3xl relative z-10" />
                    <svg
                      className="absolute inset-0 w-full h-full"
                      viewBox="0 0 100 100"
                    >
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
                  <h3 className="text-2xl font-bold text-gray-800 mb-4">
                    {item.title}
                  </h3>
                  <p className="text-gray-600 mb-6">{item.description}</p>
                  <motion.button
                    className="mt-auto inline-flex items-center px-4 py-2 border border-[#E62314] text-sm font-medium rounded-full text-[#E62314] hover:bg-[#E62314] hover:text-white transition-all duration-300"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleNavigation(item.url)}
                  >
                    {item.buttonText}
                    <FaArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </motion.button>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default Initiatives;
