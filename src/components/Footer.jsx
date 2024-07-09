import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AnimatedLogo from './AnimatedLogo';

const Footer = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = {
    Home: "/",
    DEMO: "https://demo.troylabs.vc/",
    BUILD: "/build",
    Team: "/team",
    Partners: "/partners",
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const handleNavigation = (url) => {
    if (url.startsWith('http')) {
      window.open(url, '_blank');
    } else {
      navigate(url);
    }
  };

  const AnimatedShape = ({ children }) => (
    <motion.div
      className="absolute hidden md:block"
      initial={{ rotate: 0 }}
      animate={{ rotate: 360 }}
      transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.div>
  );

  return (
    <footer className="w-full text-gray-800 py-12 md:py-16 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
          <div className="flex flex-col items-center md:items-start">
            <motion.div
              className="relative"
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                className="absolute top-0 left-0 w-full h-full"
                initial={{ rotate: 0 }}
                animate={{ rotate: 5 }}
                transition={{ duration: 10, repeat: Infinity, repeatType: "reverse" }}
              />
              <AnimatedLogo scrolled={true} scale={0.5} />
            </motion.div>
            <motion.p 
              className="mt-4 text-center md:text-left text-gray-600 max-w-[240px] md:max-w-[60%]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Empowering USC's next generation of entrepreneurs
            </motion.p>
          </div>
          <div className="flex flex-col items-center md:items-start">
            <h3 className="text-xl font-bold mb-4">Navigation</h3>
            <ul className="space-y-2 text-center md:text-left">
              {Object.entries(navItems).map(([name, url], index) => (
                <motion.li 
                  key={name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                >
                  <button
                    onClick={() => handleNavigation(url)}
                    className="text-gray-600 hover:text-[#F19E18] transition-colors duration-300"
                  >
                    {name}
                  </button>
                </motion.li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-center md:items-start">
            <h3 className="text-xl font-bold mb-4">Contact Us</h3>
            <motion.p 
              className="text-gray-600 text-center md:text-left"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <b>Email:</b> troylabs@usc.edu
            </motion.p>
          </div>
        </div>
        <motion.div 
          className="mt-12 pt-8 border-t border-gray-300 text-center text-gray-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          © {new Date().getFullYear()} TroyLabs. All rights reserved.
        </motion.div>
      </div>
      
      {/* Background Animations */}
      <AnimatedShape>
        <motion.div
          className="w-64 h-64 rounded-full bg-gradient-to-r from-[#F19E18] to-[#E62314] opacity-10"
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
      </AnimatedShape>
      <svg
        className="absolute bottom-0 right-0 w-64 h-64 opacity-10 hidden md:block"
        viewBox="0 0 100 100"
      >
        <motion.circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#F19E18"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{
            duration: 5,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        />
      </svg>
    </footer>
  );
};

export default Footer;