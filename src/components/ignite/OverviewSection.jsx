import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import rocket from "../../assets/ignite-rocket.gif";
import "./animations.css";

//https://www.youtube.com/watch?v=MwoluCY7jCk animated rocket

const FlyingRocket = ({ beginAnimate }) => {
  return (
    <div className="rocketContainer">
      <img
        src={rocket}
        alt="rocket gif"
        className={`rocket ${beginAnimate ? "animate" : ""}`}
      />
    </div>
  );
};

const BulletPoints = ({ beginAnimate }) => {
  const content = [
    [
      "Not sure about entrepreneurship?",
      "Ignite is open to students with a wide range of experiences. No matter your background, Ignite provides a platform for growth.",
    ],
    [
      "Busy Schedule?",
      "Ignite is a no-pressure program, with numerous opportunities for professional growth and networking, to provide value without a demanding time commitment",
    ],
  ];

  return (
    <ul
      className={`list-disc list-inside mt-5 opacity-0 ${
        beginAnimate ? "show-delay-2" : ""
      }`}
    >
      {content.map((item, index) => (
        <li key={index} className="text-gray-600 font-semibold text-xl mt-8">
          {item[0]}
          <h3 className="text-gray-500 text-base mt-4 pl-3">{item[1]}</h3>
        </li>
      ))}
    </ul>
  );
};

const OverviewSection = () => {
  const topRowContainer = "rounded-md border border-gray-300 h-80 lg:h-96";
  const bottomRowContainer = "flex-grow rounded-md border border-gray-300 h-80";

  const [beginAnimate, setBeginAnimate] = useState(false);
  const elementRef = useRef(null);

  //start animation when 50% of elementRef is in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setBeginAnimate(true);
        }
      },
      { threshold: 0.5 }
    );

    const currentElement = elementRef.current;
    observer.observe(currentElement);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="w-full flex justify-center min-h-screen py-16 bg-gray-50">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] w-full place-items-center">
        <div
          ref={elementRef}
          className="flex flex-col h-full px-20 lg:px-10 lg:py-12"
        >
          <FlyingRocket beginAnimate={beginAnimate} />
          <h1 className="relative text-8xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent mb-3">
            <div
              className={`absolute inset-0 bg-gray-50 ignite ${
                beginAnimate ? "animate" : ""
              }`}
            ></div>
            IGNITE
          </h1>
          <h2
            className={`text-lg font-bold text-gray-800 opacity-0 ${
              beginAnimate ? "show-delay-1" : ""
            }`}
          >
            Your fuel for entrepreneurship
          </h2>
          <BulletPoints beginAnimate={beginAnimate} />
          <motion.button
            className={`px-8 py-3 w-44 mt-8 rounded-full text-m font-bold transition-colors duration-200 bg-gradient-to-r from-yellow-400 to-orange-500 text-white opacity-0 ${
              beginAnimate ? "show-delay-2" : ""
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {}}
          >
            Join Ignite <span>&rarr;</span>
          </motion.button>
        </div>
        <div className="w-7/12 lg:w-full flex gap-10 flex-col justify-center items-center px-8">
          <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className={topRowContainer}>item</div>
            <div className={topRowContainer}>item</div>
          </div>
          <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-10 justify-center">
            <div className={bottomRowContainer}>item</div>
            <div className={bottomRowContainer}>item</div>
            <div className={bottomRowContainer}>item</div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default OverviewSection;
