import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import rocket from "../../assets/ignite-rocket.gif";
import newMems from "../../assets/RetreatNewMems.jpg";
import IGNITECommunity from "../../assets/IGNITECommunity.png";
import IGNITERiotGames from "../../assets/IGNITERiotGames.jpg";
import IGNITESlack from "../../assets/IGNITESlack2.jpg";
import IGNITETLMembers from "../../assets/IGNITETLMembers.png";
import IGNITESpeaker from "../../assets/IGNITESpeaker.jpeg";
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
        <li key={index} className="text-gray-700 font-semibold text-xl mt-8">
          {item[0]}
          <p className="text-gray-500 text-base mt-4 pl-3">{item[1]}</p>
        </li>
      ))}
    </ul>
  );
};

const OverviewCard = ({ img, subheader, header, body, smaller }) => {
  return (
    <div className="max-full h-full">
      <div className={`relative ${smaller ? "h-IGNphoto-sm" : "h-IGNphoto-lg"} w-full border-b-2 border-orange-400`}>
        <img
          src={img}
          alt="ignite display photos"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="w-full px-4 py-3 pb-7 flex flex-col">
        <h3 className="text-orange-500 font-semibold p-0 text-md ">
          {subheader}
        </h3>
        <h2 className="text-gray-700 font-semibold leading-snug pt-2 pb-3 text-lg">
          {header}
        </h2>
        <p className="text-gray-500 p-0 text-sm">{body}</p>
      </div>
    </div>
  );
};

const OverviewSection = () => {
  const topRowContainer =
    "rounded-md overflow-hidden border-2 border-gray-200 h-fit min-h-full shadow-[0_4px_10px_rgba(0,0,0,0.3)] transition-transform duration-300 hover:scale-[1.015]";
  const bottomRowContainer =
    "flex-grow rounded-md overflow-hidden border-2 border-gray-200 h-fit min-h-full shadow-[0_4px_10px_rgba(0,0,0,0.3)] transition-transform duration-300 hover:scale-[1.015]";

  const cardContent = [
    [
      "Workshops",
      "Learn from Troy Lab's best",
      "Gain exclusive and valuable knowledge from some of USC's top visionaries in product managment, SWE, design, marketing, and VC.",
    ],
    [
      "Speakers",
      "Connect with industry experts",
      "Network with distinguished leaders, gaining insights from their expertise, experiences, and innovative perspectives.",
    ],
    [
      "Events",
      "Access to Exclusive Events",
      "Past events include a premier tour of the Riot Games facility, to see behind the scenes on how this company operates.",
    ],
    [
      "Community",
      "Like-minded individuals",
      "Surround yourself with ambitious, determined peers, to drive a strong competitive sprit.",
    ],
    [
      "Opportunities",
      "Know about openings",
      "Get exclusive recruiting notifications and communication with TL's top members through the IGNITE Slack.",
    ],
  ];

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
          className="flex flex-col h-full px-20 lg:px-10 py-12"
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
            onClick={() => {
              window.location.href = "https://docs.google.com/forms/d/e/1FAIpQLScIEOShyPZR3NcCKBYGFQyjXedeuz3iZPqQnH3i8JDzIle4tA/viewform";
            }}
          >
            Join Ignite <span>&rarr;</span>
          </motion.button>
        </div>
        <div className="w-full lg:w-full flex gap-10 flex-col justify-center items-center px-8">
          <div className="w-full grid grid-cols-1 min-h-96 lg:grid-cols-2 gap-5">
            <div className={topRowContainer + " rounded-tl-3xl"}>
              <OverviewCard
                img={IGNITETLMembers}
                subheader={cardContent[0][0]}
                header={cardContent[0][1]}
                body={cardContent[0][2]}
                smaller={false}
              />
            </div>
            <div className={topRowContainer + " rounded-tr-3xl"}>
              <OverviewCard
                img={IGNITESpeaker}
                subheader={cardContent[1][0]}
                header={cardContent[1][1]}
                body={cardContent[1][2]}
                smaller={false}
              />
            </div>
          </div>
          <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-5 justify-center">
            <div className={bottomRowContainer + " rounded-bl-3xl"}>
              <OverviewCard
                img={IGNITERiotGames}
                subheader={cardContent[2][0]}
                header={cardContent[2][1]}
                body={cardContent[2][2]}
                smaller={true}
              />
            </div>
            <div className={bottomRowContainer}>
              <OverviewCard
                img={IGNITECommunity}
                subheader={cardContent[3][0]}
                header={cardContent[3][1]}
                body={cardContent[3][2]}
                smaller={true}
              />
            </div>
            <div className={bottomRowContainer + " rounded-br-3xl"}>
              <OverviewCard
                img={IGNITESlack}
                subheader={cardContent[4][0]}
                header={cardContent[4][1]}
                body={cardContent[4][2]}
                smaller={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default OverviewSection;
