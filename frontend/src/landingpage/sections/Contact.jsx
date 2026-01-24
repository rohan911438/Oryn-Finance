import { Button } from "@/components/ui/button";

const Contact = () => {
  return (
    <section id="contact" className="c-space py-20 flex flex-col items-center justify-center text-center gap-6">
      <h2 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-[#FF8C00] via-[#5F9EA0] to-[#7a57db] bg-clip-text text-transparent">
        Ready to start trading?
      </h2>
      <p className="text-neutral-400 max-w-xl">
        Join thousands of traders on Oryn Finance and predict the future today.
      </p>
      <a href="/markets">
        <Button className="btn-primary-gradient px-8 py-6 text-lg rounded-full">
          Launch App
        </Button>
      </a>
    </section>
  );
};

export default Contact;
