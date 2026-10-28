import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { Background, BrandMark, Footer } from "../components/layout";
import { useAppConfig } from "../lib/session";

export default function Landing() {
  const navigate = useNavigate();
  const { data: config } = useAppConfig();

  const cards = [
    {
      key: "institution",
      icon: Building2,
      title: "Institution Login",
      desc: "Apply for EoA, new courses, intake changes and approval requests.",
      accent: "brand",
      to: "/login/institution",
    },
    {
      key: "official",
      icon: ShieldCheck,
      title: "AICTE Officials Login",
      desc: "Review applications, inspect verification findings and record decisions.",
      accent: "teal",
      to: "/login/official",
    },
  ] as const;

  return (
    <div className="relative flex min-h-screen flex-col">
      <Background />
      <div className="absolute left-5 top-5 z-10 sm:left-8 sm:top-7">
        <div className="rounded-2xl bg-white/85 px-4 py-2.5 shadow-glass backdrop-blur-xl">
          <BrandMark className="h-9 sm:h-10" />
        </div>
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="mb-9 max-w-2xl text-center"
        >
          <h1 className="text-balance text-3xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-4xl lg:text-5xl">
            AICTE Approval & Document Verification
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm font-medium text-white/90 sm:text-base">
            NeyamNetra streamlines Extension of Approval, intake changes and new programmes — with readability checks and transparent, auditable review.
          </p>
        </motion.div>

        <div className="grid w-full max-w-4xl gap-5 sm:grid-cols-2">
          {cards.map((card, i) => {
            const Icon = card.icon;
            const isBrand = card.accent === "brand";
            return (
              <motion.button
                key={card.key}
                onClick={() => navigate(card.to)}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.15 + i * 0.12 }}
                whileHover={{ y: -6 }}
                whileTap={{ scale: 0.98 }}
                className="group glass flex flex-col items-center rounded-3xl p-8 text-center outline-none focus-visible:ring-4 focus-visible:ring-white/60"
              >
                <span className={`mb-5 flex h-20 w-20 items-center justify-center rounded-full ${isBrand ? "bg-brand-100 text-brand-600" : "bg-teal-100 text-teal-600"} shadow-sm transition group-hover:scale-105`}>
                  <Icon className="h-9 w-9" strokeWidth={2} />
                </span>
                <h2 className="text-xl font-bold text-navy-900">{card.title}</h2>
                <p className="mt-2 min-h-[2.75rem] max-w-xs text-sm text-navy-600">{card.desc}</p>
                <span className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-sm transition ${isBrand ? "bg-brand-600 group-hover:bg-brand-700" : "bg-teal-600 group-hover:bg-teal-700"}`}>
                  Login <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </motion.button>
            );
          })}
        </div>

        {config?.demo_mode && (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 text-xs font-semibold text-navy-700 shadow-sm backdrop-blur"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            Demonstration mode — sign in with any non-empty credentials
          </motion.p>
        )}
      </main>
      <Footer light />
    </div>
  );
}
