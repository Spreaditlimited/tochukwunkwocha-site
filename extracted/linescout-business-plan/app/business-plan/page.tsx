import BusinessPlanForm from "@/components/BusinessPlanForm";

export default function BusinessPlanPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-4">Generate Your Business Plan</h1>
      <p className="text-gray-600 mb-8">
        Enter your details below and LineScout will generate a complete
        professional business plan for you.
      </p>

      {/* 👇 THIS is where the form goes */}
      <section className="mt-10">
        <BusinessPlanForm />
      </section>
    </main>
  );
}