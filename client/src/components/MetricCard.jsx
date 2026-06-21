export default function MetricCard({ label, value, tone = "default" }) {
  return (
    <article className={`metric ${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}
