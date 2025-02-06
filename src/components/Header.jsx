import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedLogo from "./AnimatedLogo";
import { FaBars, FaTimes } from "react-icons/fa";

function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [applicationsOpen, setApplicationsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // const navItems = ["Home", "DEMO", "BUILD", "Team", "Partners"];

  const navItems = {
    Home: "/",
    DEMO: "https://demo.troylabs.vc/",
    BUILD: "/build",
    IGNITE: "/ignite",
    Team: "/team",
    Partners: "/partners",
  };

  return (
    <motion.header
      className={`w-full h-20 px-4 sm:px-8 backdrop-blur-sm flex flex-row items-center justify-between fixed top-0 z-[999] ${
        isOpen ? "bg-black bg-opacity-80" : "bg-transparent"
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
    >
      <div className="flex flex-row items-center justify-start w-64">
        <AnimatedLogo scrolled={scrolled} scale={0.175} />
      </div>

      <nav className="hidden md:flex items-center space-x-6">
        {Object.keys(navItems).map((item) => (
          <a
            key={item}
            href={navItems[item]}
            className={`text-sm font-medium transition-colors duration-200 ${
              scrolled
                ? "text-[#F19E18] hover:text-[#E62314]"
                : "text-white hover:text-[#F19E18]"
            }`}
          >
            {item}
          </a>
        ))}
      </nav>

      <div className="flex flex-row items-center justify-end gap-2 w-64">
        {applicationsOpen && (
          <motion.button
            className={`hidden md:block w-32 py-2 pr-4 rounded-full text-sm font-bold ${
              scrolled ? "text-[#F19E18]" : " text-white"
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              applicationsOpen
                ? window.open("https://forms.gle/Brjdti1Hfp5jgiCa6", "_blank")
                : window.open(
                    "https://docs.google.com/forms/d/e/1FAIpQLScIEOShyPZR3NcCKBYGFQyjXedeuz3iZPqQnH3i8JDzIle4tA/viewform",
                    "_blank"
                  );
            }}
          >
            {applicationsOpen ? "Apply as a Startup" : "Join Ignite"}
          </motion.button>
        )}
        <motion.button
          className={`hidden md:block w-32 px-6 py-2 rounded-full text-sm font-bold transition-colors duration-200 ${
            scrolled
              ? "19E18] texbg-[#Ft-white hover:bg-[#E62314]"
              : "bg-white text-[#F19E18] hover:bg-[#F19E18] hover:text-white"
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            applicationsOpen
              ? window.open("https://form.typeform.com/to/ksUMe8CV", "_blank")
              : window.open(
                  "https://docs.google.com/forms/d/e/1FAIpQLScIEOShyPZR3NcCKBYGFQyjXedeuz3iZPqQnH3i8JDzIle4tA/viewform",
                  "_blank"
                );
          }}
        >
          {applicationsOpen ? "Apply Now" : "Join Ignite"}
        </motion.button>
      </div>

      <motion.button
        className="md:hidden text-2xl"
        onClick={() => setIsOpen(!isOpen)}
        whileTap={{ scale: 0.95 }}
      >
        {isOpen ? (
          <FaTimes color={scrolled ? "#F19E18" : "white"} />
        ) : (
          <FaBars color={scrolled ? "#F19E18" : "white"} />
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute top-20 px-3 left-0 w-full py-4 pb-8 backdrop-blur-sm bg-black bg-opacity-80"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {Object.keys(navItems).map((item) => (
              <a
                key={item}
                href={`${item === "Home" ? "/" : item.toLowerCase()}`}
                className={`block px-4 py-2 ${
                  scrolled
                    ? "text-[#F19E18] hover:text-[#E62314]"
                    : "text-white hover:text-[#F19E18]"
                }`}
                onClick={() => setIsOpen(false)}
              >
                {item}
              </a>
            ))}
            {applicationsOpen && <motion.button
              className={`w-full rounded-md px-4 py-2 mt-4 text-sm font-bold ${
                scrolled
                  ? "bg-[#F19E18] text-white hover:bg-[#E62314]"
                  : "bg-white text-[#F19E18] hover:bg-[#F19E18] hover:text-white"
              } transition-colors duration-200`}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                applicationsOpen
                  ? window.open("https://forms.gle/Brjdti1Hfp5jgiCa6", "_blank")
                  : window.open(
                      "https://docs.google.com/forms/d/e/1FAIpQLScIEOShyPZR3NcCKBYGFQyjXedeuz3iZPqQnH3i8JDzIle4tA/viewform",
                      "_blank"
                    );
              }}
            >
              {applicationsOpen ? "Apply as a Startup" : "Join Ignite"}
            </motion.button>}
            <motion.button
              className={`w-full rounded-md px-4 py-2 mt-4 text-sm font-bold ${
                scrolled
                  ? "bg-[#F19E18] text-white hover:bg-[#E62314]"
                  : "bg-white text-[#F19E18] hover:bg-[#F19E18] hover:text-white"
              } transition-colors duration-200`}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                applicationsOpen
                  ? window.open(
                      "https://form.typeform.com/to/ksUMe8CV",
                      "_blank"
                    )
                  : window.open(
                      "https://docs.google.com/forms/d/e/1FAIpQLScIEOShyPZR3NcCKBYGFQyjXedeuz3iZPqQnH3i8JDzIle4tA/viewform",
                      "_blank"
                    );
              }}
            >
              {applicationsOpen ? "Apply Now" : "Join Ignite"}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

export default Header;
